# Wishlist Operations Runbook

The single operator runbook for the Wishlist bot. It assumes no prior context.
No secret values appear here, only names and file locations.

The Mongo to D1 cutover (section 8) and parts of the Workers Builds setup (section 4) are forward-looking: they describe what to do, not what has been done. Progress and the real timestamps, SHAs and numbers are recorded in [MIGRATION_STATUS.md](../MIGRATION_STATUS.md).

## Contents

1. [Architecture at a glance](#1-architecture-at-a-glance)
2. [Local setup](#2-local-setup)
3. [Secrets and environments](#3-secrets-and-environments)
4. [Deploy with Workers Builds](#4-deploy-with-workers-builds)
5. [Previews and the preview bot](#5-previews-and-the-preview-bot)
6. [Database migrations](#6-database-migrations)
7. [Copy production data into preview](#7-copy-production-data-into-preview)
8. [Mongo to D1 cutover runbook](#8-mongo-to-d1-cutover-runbook)
9. [Rollback](#9-rollback)
10. [Production operations](#10-production-operations)
11. [Releases and announcements](#11-releases-and-announcements)
12. [Share pages and home pages](#12-share-pages-and-home-pages)
13. [Observability](#13-observability)
14. [Troubleshooting](#14-troubleshooting)
15. [Lessons from princess that apply](#15-lessons-from-princess-that-apply)
16. [Follow-ups](#16-follow-ups)
17. [Telegram Mini App](#17-telegram-mini-app)
18. [Prices and exchange rates](#18-prices-and-exchange-rates)
19. [Link import](#19-link-import)
20. [List import](#20-list-import)

## 1. Architecture at a glance

| Piece             | Value                                                                                                                                                                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime           | Cloudflare Worker `wishlist` (wrangler env `production`), Hono + Hono JSX + Telegraf                                                                                                                                                                                                         |
| Domain            | `wishlist.chernenko.dev` (custom domain): the bot webhook, the home pages (`/ua`, `/en`, `/pl`), the public share pages (`/w/<id>`, `/<lang>/w/<id>`), `/status`, `/robots.txt` and `/sitemap.xml`, the Telegram Mini App (`/app`, `/api/app/*`) and the image proxy (`/img/*`) (section 17) |
| Telegram webhook  | Secret header (`X-Telegram-Bot-Api-Secret-Token`) plus secret path (`TELEGRAM_WEBHOOK_PATH`)                                                                                                                                                                                                 |
| Production D1     | `wishlist-production` (`6d194ed1-4446-4092-af68-606a33601801`)                                                                                                                                                                                                                               |
| Preview D1        | `wishlist-preview` (`3ab03825-4610-4164-9bec-2c47d00ac73e`)                                                                                                                                                                                                                                  |
| Production queues | `wishlist-release-announcements` (producer and consumer) with dead-letter queue `wishlist-release-announcements-dlq`                                                                                                                                                                         |
| Image cache (R2)  | Bucket `wishlist-images` in production, `wishlist-images-preview` in previews and local, binding `IMAGES` (section 17)                                                                                                                                                                       |
| Preview queue     | `wishlist-preview-release-announcements` (producer only, nothing consumes it)                                                                                                                                                                                                                |
| Production crons  | `0 0 * * *` (daily maintenance and exchange rates), `*/10 * * * *` (release broadcast and state snapshot)                                                                                                                                                                                    |
| Account           | Cloudflare account `5396970bbe7f97f2d01c5b759444cd40`                                                                                                                                                                                                                                        |
| Bots              | Production `@wishlist_ua_bot`, preview `@InevixTestBot`                                                                                                                                                                                                                                      |
| Legacy            | Node.js long polling on a VPS with MongoDB Atlas, tagged `legacy-1.7.1` (`924b0e3`). Not part of 2.0.0.                                                                                                                                                                                      |

Config lives in `wrangler.jsonc` (strict JSON). The preview Worker shape is under `env.production.previews`.

### How an update is handled

The bot is a stateless router on Telegraf. Telegraf is used only as the update parser and Telegram API client (`bot.handleUpdate`); there is no `Scenes` and no `session()` middleware.

1. The webhook route checks the secret header, caps the body, and claims the `update_id` in the `telegram_updates` ledger so a retried update is not handled twice.
2. Only private chats are served. Updates from groups are ignored without a reply.
3. A `my_chat_member` update with status `kicked` soft-blocks the user (`users.blocked_at`). Status `member` clears it.
4. For a callback, `answerCbQuery` is the first step and the clicked message's inline keyboard is removed (except for item actions that update it in place).
5. The user row is loaded by Telegram id, the profile is synced (username, `telegram_language_code`, `last_seen_at` and `last_bot_seen_at` at most once per hour, `blocked_at` cleared), then the session row is loaded.
6. The locale is resolved: `users.language`, then `sessions.language` for guests, then the Telegram `language_code`. `NULL` means Auto.
7. `/start`, `/lang [uk|ua|en|pl|auto]` and `/releases` are handled first. A callback is decoded and dispatched to a handler. Text, contact or photo input is handled only through `session.state.pendingInput`; with no pending input the home menu is rendered.

Design points:

- **D1 sessions.** One row per private-chat user in `sessions` (key is the Telegram id, guests included). The JSON `state` holds only ids: `pendingInput` (what the next message means) and `find` (the current third-party search). It is validated on read and reset to the default if invalid. Rows untouched for 90 days are pruned by the daily cron.
- **Stateless `callback_data`.** Every button carries its action and entity id (for example `w:e:<wishId>`, `wl:p:<offset>`, `l:pl`), at most 64 bytes. A screen therefore works with an empty session: after an outage, a prune, or from an old message. Entity callbacks are authorized against the caller: a wish must belong to the caller; third-party pages, filters and gives require the owner found by the caller's own latest search (`session.find.targetUserId`), and a take requires an existing give. Ids are sequential, so this binding prevents walking other users' lists. The give list shows an owner only by a public `@username`, never by phone. Buttons left in chat history by the legacy bot are mapped to the matching screen or answered with an "outdated button" toast and the home menu.
- **Navigation is immediate.** There is no 2 second timer. After an edit the bot sends the result message and renders the next screen in the same update.
- **Album debounce.** While a wish is waiting for images, each photo is appended atomically (largest size, deduplicated, at most 9). Photos of one album are marked in `sessions.media_group_id` and `sessions.media_group_marker` (the `update_id` of the latest photo). The update schedules `waitUntil(wait 1500 ms, then task)`. The task re-reads the marker and only the last photo of the album sends the success message and renders the edit screen. If the isolate is evicted first, `pendingInput` stays on images and the user's next text gets the edit menu, which is a clean recovery.
- **Soft-block.** A 403 from Telegram or a `kicked` status sets `users.blocked_at` instead of deleting data. Blocked users are excluded from search, from the release broadcast and from the active-user stats. The next update from the user clears the flag.
- **Parse mode is HTML** everywhere, with all user content escaped. Wish lists are paginated, 10 wishes per page with a "Show more" button.
- **Locales.** `uk` (base), `en` and `pl`, plus Auto. Auto resolves from the Telegram `language_code`: `uk*` gives uk, `pl*` gives pl, any other non-empty code gives en, none gives uk. Users imported from Mongo start with an explicit `uk`, because Auto would switch long-time Ukrainian users whose Telegram is in another language; new users start in Auto. The language screen is reachable from the globe button on the home menu and from `/lang`.

### Tables

| Table                   | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                 | Registered users (guests have no row). Language, `currency` (the display currency setting, section 18), visibility, payments, `delivery_address`, the disclosure flags `show_payments` (default on), `show_phone` and `show_address` (default off) and the gifted flag `show_gifted` (default off in the schema; every row is written with `1`: see Gifted wishes on share pages), filter, `release_version`, `blocked_at`, `last_seen_at`, `last_bot_seen_at`, `last_app_seen_at` |
| `wishes`                | Wishes. `user_id` is `NULL` for wishes imported from users that the legacy bot had already deleted. `priority_level` (0 none, 1 low, 2 medium, 3 high), `currency` (the currency of `price`), `gifted_hidden`. The legacy boolean `priority` is still written together with `priority_level` (true only for high) and is dropped in 2.1 (section 16)                                                                                                                               |
| `wishlist_shares`       | One row per shared list: opaque ULID `public_id`, `display_name`, `show_username`, `allow_indexing` (default on), `revoked_at` (see section 12)                                                                                                                                                                                                                                                                                                                                    |
| `gives`                 | "I want to give" marks, unique per `(user_id, wish_id)`                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `sessions`              | Router state per private-chat user, pruned after 90 days                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `telegram_updates`      | Webhook idempotency ledger, pruned by the daily cron                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `release_announcements` | Announcement status per release version and user (`queued`, `sending`, `sent`, `skipped`, `failed`)                                                                                                                                                                                                                                                                                                                                                                                |
| `exchange_rates`        | Hryvnias per dollar, euro and złoty from the NBU, with the rate date and the fetch time (see section 18)                                                                                                                                                                                                                                                                                                                                                                           |

## 2. Local setup

```sh
pnpm install
```

Git-ignored files are required for anything that talks to Telegram or Cloudflare. Examples with placeholder values are committed next to them (`*.example`).

```sh
cp .dev.vars.example .dev.vars
cp .dev.vars.production.example .dev.vars.production
cp .dev.vars.preview.example .dev.vars.preview
cp env/.env.d1.example env/.env.d1
chmod 600 .dev.vars .dev.vars.production .dev.vars.preview env/.env.d1
```

Local development with real Telegram delivery needs a Cloudflare tunnel:

```sh
cp cloudflared.example.yml cloudflared.yml
```

Follow the comments in the file (`cloudflared tunnel create wishlist-dev`, then route `wishlist-dev.chernenko.dev` to it). Then:

```sh
pnpm run dev
```

`pnpm run dev` (alias `worker:dev`) starts `wrangler dev`, starts `cloudflared` when `cloudflared.yml` exists, sets the local webhook once the Worker is ready and deletes it on shutdown. For the plain Worker without the tunnel and webhook automation use `pnpm run worker:dev:raw`. Local webhook helpers: `pnpm telegram:webhook:set:local`, `telegram:webhook:info:local`, `telegram:webhook:delete:local`. The local bot (`BOT_ENVIRONMENT="local"`) serves only `ADMIN_ID`, like the preview bot: updates from any other user are ignored silently, so set `ADMIN_ID` in `.dev.vars` to your own Telegram id.

Local D1:

```sh
pnpm db:migrate:local
pnpm db:query:local --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Authentication for Cloudflare CLIs:

```sh
pnpm exec wrangler login   # OAuth; can expire
cf auth login              # only for the cf CLI
```

An expired login shows up as `Invalid access token`. Run `pnpm exec wrangler login` again. `CLOUDFLARE_AUTH_MODE=wrangler-login` is rejected in CI; it is for local operators only.

Run all local checks before pushing (changeset validation, lint, format check, typecheck, release manifest sync, tests):

```sh
pnpm run check
```

## 3. Secrets and environments

| Environment | Where it runs                                                     | Bot                | D1 database           | Release broadcast |
| ----------- | ----------------------------------------------------------------- | ------------------ | --------------------- | ----------------- |
| local       | `wrangler dev` (name `wishlist-local`)                            | any test bot       | local D1 (miniflare)  | off               |
| production  | Worker `wishlist` at `https://wishlist.chernenko.dev`             | `@wishlist_ua_bot` | `wishlist-production` | on                |
| preview     | Workers Previews, `https://<name>-wishlist.chernenko.workers.dev` | `@InevixTestBot`   | `wishlist-preview`    | off               |

Secret names:

| Name                      | Used by             | Notes                                                                                                  |
| ------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| `BOT_TOKEN`               | all environments    | Different token per environment. Never use the preview token in production or the reverse              |
| `TELEGRAM_WEBHOOK_SECRET` | all environments    | Expected `X-Telegram-Bot-Api-Secret-Token` header. Also gates `/health` and `/admin/release-broadcast` |
| `TELEGRAM_WEBHOOK_PATH`   | all environments    | Webhook route, for example `/telegram/wishlist-<random>`                                               |
| `ADMIN_ID`                | production, preview | Telegram user id that receives feedback. The admin must have started the bot once                      |
| `NEW_RELIC_LICENSE_KEY`   | production only     | Local and preview never ingest into New Relic                                                          |

`wrangler.jsonc` lists these under `secrets.required`, so a deploy fails while one is missing. Production requires all five; local requires `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` and `TELEGRAM_WEBHOOK_PATH`.

Files (all git-ignored, mode 600). They, together with Cloudflare, hold the only copy of the secrets. Back them up in a password manager.

| File                   | Variable names                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `.dev.vars`            | `ADMIN_ID`, `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_PATH`, `WORKER_BASE_URL`                             |
| `.dev.vars.production` | the same, plus `NEW_RELIC_LICENSE_KEY`; `WORKER_BASE_URL` is `https://wishlist.chernenko.dev`                              |
| `.dev.vars.preview`    | `ADMIN_ID`, `BOT_TOKEN` (of the preview bot), `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_PATH`                           |
| `env/.env.d1`          | `CLOUDFLARE_AUTH_MODE=wrangler-login`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, `CLOUDFLARE_PREVIEW_DATABASE_ID` |

`env/.env.d1.example` also lists `CLOUDFLARE_D1_TOKEN`, `CLOUDFLARE_D1_TOKEN_PREVIEW` and `CLOUDFLARE_API_TOKEN`. The two D1 tokens are the copies of the Workers Builds tokens (section 4). `CLOUDFLARE_API_TOKEN` is only for token auth mode, not for `wrangler-login`. The Mongo import additionally reads a git-ignored `env/.env.mongo` (Mongo connection string and the legacy admin id), used only during the cutover.

`MINI_APP_ENABLED` is the kill switch of the Mini App (section 17): `"false"` in `env.production.vars` until rollout step R4, `"true"` in local and previews. Each environment block also declares four rate-limit bindings and the `IMAGES` R2 bucket (bindings are not inherited).

Public (non-secret) variables such as `WISHLIST_TG_URL`, `TG_CHANNEL`, `ENABLE_RELEASE_BROADCAST` and the four support links `MONOBANK_URL`, `KOFI_URL`, `PAYPAL_URL` and `REVOLUT_URL` live in `wrangler.jsonc` for each environment. The support links feed the donate screen and the footer of the share pages; an empty value hides that link. The Worker also has an `assets` binding for `public/` and a `CF_VERSION_METADATA` binding (the deploy id used in the share page cache fingerprint). `ENABLE_RELEASE_BROADCAST` is `"false"` locally and in previews and `"true"` in production.

## 4. Deploy with Workers Builds

Cloudflare Workers Builds deploys production and builds previews. GitHub Actions never deploys: `.github/workflows/main.yml` only validates (`pnpm run check`, generated-artifact drift check, and `wrangler deploy --env production --dry-run`) and publishes GitHub Releases.

### Configuration to apply

Worker script tag (what `cf` calls `external_script_id` or `script_tag`, not the Worker name): find it with `cf -q workers scripts search --name wishlist` after the first deploy. The commands below use `$WISHLIST_TAG`.

| Item                                    | Value                                                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Repository connection                   | provider `github`, account `serhii-chernenko` (id `28815318`), repo `wishlist` (id `573848834`)                      |
| Production branch                       | `main`, root directory `/`, build caching on, path includes `*`                                                      |
| Build command (production and previews) | `pnpm run i18n:generate && pnpm run db:migrate:ci`                                                                   |
| Deploy command (production)             | `pnpm exec wrangler deploy --env production && pnpm releases:broadcast:prod`                                         |
| Deploy command (previews)               | `pnpm exec wrangler preview --env production`                                                                        |
| Build token                             | the account-level `Workers Builds - 2025-05-02 19:51` (`5adcf202-c3f3-49a5-afe1-ad20bdfc444e`), shared with princess |
| Previews                                | `previews_enabled: true` (Worker Previews)                                                                           |

Build variables for the **production trigger**:

| Name                             | Kind     | Value                                                                  |
| -------------------------------- | -------- | ---------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID`          | variable | `5396970bbe7f97f2d01c5b759444cd40`                                     |
| `CLOUDFLARE_DATABASE_ID`         | variable | `wishlist-production` id `6d194ed1-4446-4092-af68-606a33601801`        |
| `CLOUDFLARE_PREVIEW_DATABASE_ID` | variable | `wishlist-preview` id `3ab03825-4610-4164-9bec-2c47d00ac73e`           |
| `WORKER_BASE_URL`                | variable | `https://wishlist.chernenko.dev` (used by `releases:broadcast:prod`)   |
| `CLOUDFLARE_D1_TOKEN`            | secret   | API token `wishlist-builds-d1-production` (`Account > D1 > Edit` only) |
| `TELEGRAM_WEBHOOK_SECRET`        | secret   | same value as the Worker secret (used by `releases:broadcast:prod`)    |

Build variables for the **Previews base config**:

| Name                             | Kind     | Value                                                                                           |
| -------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID`          | variable | same account id                                                                                 |
| `CLOUDFLARE_DATABASE_ID`         | variable | the **production** database id (`db:migrate:ci` cross-checks both ids against `wrangler.jsonc`) |
| `CLOUDFLARE_PREVIEW_DATABASE_ID` | variable | the preview database id                                                                         |
| `CLOUDFLARE_D1_TOKEN`            | secret   | a separate API token, `wishlist-builds-d1-preview`                                              |

Do not set `WORKER_BASE_URL` or `TELEGRAM_WEBHOOK_SECRET` on previews: the preview deploy command does not broadcast. Workers Builds injects `WORKERS_CI=1` and `WORKERS_CI_BRANCH`; `db:migrate:ci` uses them to choose the database.

Preview **runtime** secrets are separate from build variables and live in the Preview base config (see below): `ADMIN_ID`, `BOT_TOKEN` (the preview bot), `TELEGRAM_WEBHOOK_PATH`, `TELEGRAM_WEBHOOK_SECRET`.

### Setup order

Do these in order. Steps marked "dashboard" cannot be done with `cf` or `wrangler`.

0. GitHub (dashboard): make sure the "Cloudflare Workers and Pages" GitHub App has access to `serhii-chernenko/wishlist`.
1. Dashboard: create two API tokens limited to `Account > D1 > Edit`, named `wishlist-builds-d1-production` and `wishlist-builds-d1-preview`, so either can be revoked on its own. Cloudflare shows a token once; copy them into `env/.env.d1` as `CLOUDFLARE_D1_TOKEN` and `CLOUDFLARE_D1_TOKEN_PREVIEW`. `cf` OAuth cannot create tokens (403).
2. Create the queues and deploy the Worker once from your machine (section 8, steps E1 and E2), because a build configuration needs an existing Worker and its script tag.
3. Connect the repository. This is mandatory before creating the build config:

    ```sh
    cf builds repos connections upsert --provider-type github \
      --provider-account-id 28815318 --provider-account-name serhii-chernenko \
      --repo-id 573848834 --repo-name wishlist
    ```

4. Create the build configuration (production trigger plus Previews base config). Run it with `--dry-run` first, then without. Check flags with `cf schema builds workers create` if one is rejected; use the flat `--production-settings-*` and `--previews-base-config-*` flags, because JSON bodies were rejected several times for princess.

    ```sh
    WISHLIST_TAG=$(cf -q workers scripts search --name wishlist | jq -r '.[] | select(.script_name=="wishlist") | .id')
    BUILD_TOKEN=5adcf202-c3f3-49a5-afe1-ad20bdfc444e
    cf builds workers create \
      --script-tag "$WISHLIST_TAG" \
      --git-repository-provider-type github \
      --git-repository-provider-account-id 28815318 \
      --git-repository-provider-account-name serhii-chernenko \
      --git-repository-repo-id 573848834 \
      --git-repository-repo-name wishlist \
      --git-repository-branch main \
      --production-settings-build-command "pnpm run i18n:generate && pnpm run db:migrate:ci" \
      --production-settings-deploy-command "pnpm exec wrangler deploy --env production && pnpm releases:broadcast:prod" \
      --production-settings-build-token-uuid "$BUILD_TOKEN" \
      --production-settings-path-includes '*' \
      --previews-base-config-build-command "pnpm run i18n:generate && pnpm run db:migrate:ci" \
      --previews-base-config-deploy-command "pnpm exec wrangler preview --env production" \
      --previews-base-config-build-token-uuid "$BUILD_TOKEN" \
      --previews-base-config-path-includes '*' \
      --previews-enabled true
    cf builds workers get "$WISHLIST_TAG"
    ```

    Compare the result with the table above. If `root_directory` or `build_caching_enabled` differ, fix them with `cf builds workers update` (`--production-settings-root-directory /`, `--production-settings-build-caching-enabled true`, and the `--previews-base-config-*` equivalents).

5. Production build variables. `upsert` takes the trigger uuid as a positional argument and only `--body`; `list` takes `--trigger-uuid` as a flag (a positional there silently prints nothing). Use `-q` before piping to `jq`, since `cf` prints a banner before the JSON. Feed secret values from `env/.env.d1` and never print them.

    ```sh
    TRIGGER=$(cf -q builds triggers list --external-script-id "$WISHLIST_TAG" | jq -r '.[0].trigger_uuid')
    cf builds triggers environment-variables upsert "$TRIGGER" --dry-run --body '{
      "CLOUDFLARE_ACCOUNT_ID": {"value": "5396970bbe7f97f2d01c5b759444cd40", "is_secret": false},
      "CLOUDFLARE_DATABASE_ID": {"value": "6d194ed1-4446-4092-af68-606a33601801", "is_secret": false},
      "CLOUDFLARE_PREVIEW_DATABASE_ID": {"value": "3ab03825-4610-4164-9bec-2c47d00ac73e", "is_secret": false},
      "WORKER_BASE_URL": {"value": "https://wishlist.chernenko.dev", "is_secret": false},
      "CLOUDFLARE_D1_TOKEN": {"value": "<CLOUDFLARE_D1_TOKEN from env/.env.d1>", "is_secret": true},
      "TELEGRAM_WEBHOOK_SECRET": {"value": "<same as the Worker secret>", "is_secret": true}
    }'
    cf builds triggers environment-variables list --trigger-uuid "$TRIGGER"
    ```

    Secrets must show `is_secret: true` and `value: null` in the listing.

6. Previews base-config build variables, with the preview D1 token:

    ```sh
    cf builds workers update "$WISHLIST_TAG" --dry-run --body '{"previews_base_config":{"environment_variables":{
      "CLOUDFLARE_ACCOUNT_ID": {"value": "5396970bbe7f97f2d01c5b759444cd40", "is_secret": false},
      "CLOUDFLARE_DATABASE_ID": {"value": "6d194ed1-4446-4092-af68-606a33601801", "is_secret": false},
      "CLOUDFLARE_PREVIEW_DATABASE_ID": {"value": "3ab03825-4610-4164-9bec-2c47d00ac73e", "is_secret": false},
      "CLOUDFLARE_D1_TOKEN": {"value": "<CLOUDFLARE_D1_TOKEN_PREVIEW from env/.env.d1>", "is_secret": true}
    }}}'
    cf builds workers get "$WISHLIST_TAG"
    ```

    Run the command again without `--dry-run` once the dry run looks right.

7. Preview base-config runtime secrets, written from `.dev.vars.preview` without printing them. They affect only previews created afterwards.

    ```sh
    ( set -a; . ./.dev.vars.preview; for n in ADMIN_ID BOT_TOKEN TELEGRAM_WEBHOOK_SECRET TELEGRAM_WEBHOOK_PATH; do printf %s "$(printenv $n)" | pnpm exec wrangler preview base-config secret put "$n" --env production; done )
    pnpm exec wrangler preview base-config secret list --env production
    ```

8. Dashboard (only if needed): Workers & Pages > `wishlist` > Settings > Build must show Worker Previews with the `wrangler preview` deploy command. Switching to Worker Previews is documented as one-way. If a legacy "non-production branch" trigger shows up instead, `cf workers-builds workers migrate-to-previews "$WISHLIST_TAG" --deploy-command "pnpm exec wrangler preview --env production"` is the alternative.
9. Verify: push a feature branch or open a PR. Expect the GitHub check `Workers Builds: wishlist`, a preview at `https://<branch-slug>-wishlist.chernenko.workers.dev`, and the log line `Applying D1 migrations to the preview database`. List builds with `cf builds list --external-script-id "$WISHLIST_TAG" --per-page 3`.

### Pitfalls

- **Chicken and egg.** `cf builds workers create` needs the script tag, so the Worker must be deployed first, from your machine.
- **Build command timing.** The Previews build command is shared by every branch. A branch or `main` build whose tree has no `db:migrate:ci` script fails with `Missing script: db:migrate:ci`. Connect Workers Builds while the cutover branch is the only branch you push. If Cloudflare builds the legacy `main` on connect, that build fails and nothing is deployed; this is expected and harmless. Nothing is pushed to `main` until the go-live merge.
- **Production id in the previews config.** `CLOUDFLARE_DATABASE_ID` is the production id even in the Previews base config. That is by design: `db:migrate:ci` checks that both ids differ and that the chosen target equals the `wrangler.jsonc` binding.
- **Required secrets.** `ADMIN_ID` and `NEW_RELIC_LICENSE_KEY` are in the production `secrets.required` list. A missing secret fails the production deploy, so set all five production secrets before the first build.
- **Shared build token.** The account-level build token is shared with princess. Revoking it breaks both Workers.
- **One branch at a time.** All previews share one preview bot and one webhook, so only one branch preview can receive Telegram traffic at a time.
- **Branch push access is production access.** A branch build runs that branch's code with the D1 token in its environment. Anyone who can push a branch can reach production data. Keep push access limited to people trusted with production.
- **`cf` quirks.** `cf` prints an agent banner before JSON (use `-q`). `list` for environment variables takes a flag, `upsert` takes a positional.

## 5. Previews and the preview bot

- Long-lived preview named `preview`: `https://preview-wishlist.chernenko.workers.dev`. It serves the preview bot `@InevixTestBot`.
- Every preview, including per-branch previews, shares the `wishlist-preview` database and the single preview-bot webhook.
- Previews run with `BOT_ENVIRONMENT="preview"`: no cron, no queue consumer, no release broadcast. Preview logs are in the Cloudflare dashboard (Wrangler cannot tail a preview).
- The preview bot serves only the admin. When `BOT_ENVIRONMENT` is anything other than `production` (`preview`, `local`, or a missing or unknown value), every update whose sender is not `ADMIN_ID` is ignored silently: the webhook answers `200 {ignored:true}`, the bot sends no reply, nothing is written to the ledger, and telemetry records outcome `ignored` with rejection reason `previewAccessDenied`. If `ADMIN_ID` is empty, nobody is served. This keeps imported production data (usernames, phone numbers, wishes) away from anyone else who finds the preview bot. To test with another account, temporarily change `ADMIN_ID` for the preview and restore it afterwards.
- Telegram file ids belong to the bot that received the photo. After importing production data into preview, imported wishes show the text fallback instead of images (the bot logs `wish_media_failed`). Test images with fresh uploads, including a 3-photo album.

Redeploy the long-lived preview. Do not put `--` before `--name`; pnpm would pass it through and wrangler would drop the name:

```sh
pnpm worker:preview --name preview
```

Point the preview bot webhook at a branch preview. This needs `.dev.vars.preview`, `gh` logged in, and the branch pushed:

```sh
pnpm preview:url                 # print the preview origin for the current branch
pnpm preview:wait                # wait for the Workers Builds check, then for the preview to answer
pnpm preview:point               # url, wait, then setWebhook with --drop-pending-updates=true
pnpm preview:point --no-wait --drop-pending-updates=false
pnpm preview:reset               # back to https://preview-wishlist.chernenko.workers.dev
```

- `preview:url` needs no env file. `preview:wait`, `preview:point`, `preview:smoke` and `preview:reset` load `.dev.vars.preview` from the current directory, or from the main checkout when you run them in a git worktree, and let it override any `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` and `TELEGRAM_WEBHOOK_PATH` already in your shell.
- `preview:point` and `preview:reset` call Telegram `getMe` first and refuse to change the webhook unless the token belongs to `@InevixTestBot`.
- Timeouts: `--timeout-seconds N` (default 600) for the Workers Builds check, `--ready-timeout-seconds N` (default 120) for the preview to answer on `/` and `/health`, `--interval-seconds N` (default 10) for polling.
- The origin is computed from the branch with no network call: `https://<branch-slug>-wishlist.chernenko.workers.dev`. `preview:url --branch <name>` computes it for another branch. Prefer short branch names; Cloudflare shortens and hashes long ones.
- The webhook is shared. `preview:point` prints `previousOrigin` when the bot pointed at a different preview.
- If the preview does not respond in time, take the URL from the Workers Builds comment on the pull request and run `pnpm telegram:webhook:set:preview --url <url> --drop-pending-updates=true`.

Opt-in smoke test. It sends a synthetic `/start` update to the preview webhook, so the preview bot may reply in that chat. Use a chat id you control; there is no default:

```sh
pnpm preview:smoke --chat-id <id> [--user-id <id>] [--url https://<name>-wishlist.chernenko.workers.dev]
```

`preview_smoke_accepted` only proves that the Worker answered HTTP 200. Check the chat for the actual reply.

Lower-level commands. `--url` is explicit and must not be the production origin:

```sh
pnpm telegram:webhook:set:preview --url https://preview-wishlist.chernenko.workers.dev --drop-pending-updates=true
pnpm telegram:webhook:info:preview --url https://preview-wishlist.chernenko.workers.dev
pnpm telegram:webhook:delete:preview --drop-pending-updates=true
pnpm telegram:commands:set:preview
```

Delete a merged branch's preview and point the bot back at the long-lived one:

```sh
pnpm exec wrangler preview delete --name <branch-slug> --env production -y
pnpm preview:reset
```

Rules:

- `preview:point` also sets the admin chat menu button to the branch `/app`, and `preview:reset` restores the default menu button (section 17).
- The Mini App of a preview serves only `ADMIN_ID`, like the webhook.
- Never use the preview bot token in production or the production bot token in a preview.
- Use the preview bot only in private chats you control.

## 6. Database migrations

Workers Builds applies migrations automatically, before the deploy:

| Build                      | Database migrated     |
| -------------------------- | --------------------- |
| `main` (production)        | `wishlist-production` |
| any other branch (preview) | `wishlist-preview`    |

```sh
pnpm db:generate            # after editing src/db/schemas/*, creates files in drizzle/
```

Commit the generated files in `drizzle/` and review the SQL in the PR, because a merge applies it to production without a manual step.

| Command                   | Use                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:migrate:local`   | local D1                                                                                                                                     |
| `pnpm db:migrate:preview` | preview D1 by hand (fallback, and before the first import)                                                                                   |
| `pnpm db:migrate:prod`    | production D1 by hand. Only for the first schema creation in the cutover, or as a fallback when Workers Builds is down. Never before a merge |
| `pnpm db:migrate:ci`      | inside Workers Builds only; refuses to run unless `WORKERS_CI=1`                                                                             |

The migrator is idempotent and reports `applied` and `alreadyApplied` migrations.

Known D1 behavior:

- **Error 7403.** The first D1 call of a session often fails with `7403`. Rerun the same command. `db:migrate:ci` retries it up to 3 attempts with a growing delay; any other error fails the build, so production is never deployed on an unmigrated schema.
- **100 bound parameters.** D1 allows at most 100 bound parameters per statement. Keep imports and bulk writes chunked at `floor(100 / columnCount)` rows or fewer.

### How automatic migration works

`pnpm db:migrate:ci` (`scripts/db/migrate-ci.ts`) runs in the build command:

- The target comes from `WORKERS_CI_BRANCH`: exactly `main` migrates production, every other branch migrates preview. A missing or empty branch, a `refs/...` value, or `WORKERS_CI` other than `1`, aborts the build. The script never defaults to a database.
- Both database ids must be pinned as build variables. They must differ, and the id of the chosen target must equal the `wrangler.jsonc` binding.
- It authenticates in token mode (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_TOKEN`) and applies pending Drizzle migrations.
- Concurrent branch builds share `wishlist-preview`. Two builds that start before either has recorded a new migration can race; the second fails on duplicate DDL and is not retried, so rerun it. A branch with a migration that is not on `main` leaves preview ahead of production until it merges.

### Migration rules

Share pages ship with the additive migration that creates `wishlist_shares` (section 12). The batch 2 migrations (`20261004083515_far_impossible_man` and `20261004090459_flat_omega_sentinel`: per-wish currency, priority levels, the disclosure flags, the delivery address, the indexing flag and the gifted flags) and `20261004111004_show_gifted_default_on` (a data-only `UPDATE users SET show_gifted = 1`) are additive too and keep the legacy `wishes.priority` column; the rollout steps are in section 12 and section 17. The old `users.telegraph_access_token` column stays in the schema, unused and `NULL`, so the code in production keeps working across the deploy. Drop it in 2.1 with two steps: deploy code that no longer lists the column, then migrate (`ALTER TABLE users DROP COLUMN telegraph_access_token`, not a table rebuild).

Keep every migration additive (new tables, new nullable or defaulted columns, new indexes). During a deploy the old code runs against the new schema for a short time, and a migration is applied before the code that needs it. Ship destructive changes (drop, rename, new NOT NULL without default) in two releases: first stop using the column, then drop it.

## 7. Copy production data into preview

Use this to test with realistic data. The direction is hard-coded: production to preview, never the reverse.

```sh
pnpm db:copy:production-to-preview --confirm-overwrite-preview
```

Without the flag the script refuses to run. It refuses when both ids resolve to the same database, checks that migrations match, exports each production table (production D1 is briefly unavailable during the export, so use a quiet moment), checks counts, wipes preview, imports parent-first, and verifies the counts again. Only `users`, `wishes` and `gives` are copied; `sessions`, `telegram_updates` and `release_announcements` are not.

If it fails, the message says whether preview was modified. After the wipe started, preview may be empty or partial; rerunning the same command is safe. `7403` is transient. `Row counts differ after copy` means production changed during the copy: rerun. `Preview migrations ... do not match production`: run `pnpm db:migrate:preview` first.

Verify:

```sh
pnpm db:query:preview --command "select count(*) as users from users"
pnpm db:query:prod --command "select count(*) as users from users"
```

A manual GitHub workflow, `Copy Production Data to Preview` (`.github/workflows/copy-production-to-preview.yml`), runs from the Actions tab on `main` and asks for the text `OVERWRITE PREVIEW`. It needs a GitHub environment named `preview` with the secret `CLOUDFLARE_API_TOKEN` and the variables `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID` and `CLOUDFLARE_PREVIEW_DATABASE_ID`. Until that environment is configured, use the local command.

After a copy, preview holds production user data (Telegram ids, usernames, phone numbers, wish contents). Restrict access to it.

## 8. Mongo to D1 cutover runbook

Forward-looking. Order matters. Record every timestamp and SHA in [MIGRATION_STATUS.md](../MIGRATION_STATUS.md). The secrets files exist only in the main checkout, are mode 600, and are never printed.

### Expected data (snapshot of 2026-09-29, live check of 2026-10-02)

| Item              | Expected after import                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Users             | 299                                                                                        |
| Wishes            | 1202, of which 163 have `user_id` NULL (their owner was deleted by the legacy 403 cleanup) |
| Gives             | 18 imported, 1 skipped (`missingWish`) out of 19                                           |
| Images            | 716 across all wishes                                                                      |
| `release_version` | `1.7.1`: 289, `1.7.0`: 2, `0.0.0`: 8 (users with no version)                               |
| Foreign keys      | `PRAGMA foreign_key_check` returns no rows                                                 |

Importer facts: `telegramId` is an int for some users and a float for others, and the importer accepts integral floats and `$numberLong` / `$numberDouble` / `$numberInt`. Missing currency becomes `UAH`. `payments` becomes `NULL` when empty, and `telegraph_access_token` is always stored as `NULL`: telegra.ph sharing no longer exists. Imported users get `language = uk`. Recompute the numbers from the importer report on every run; they can change if users act before the freeze.

### E0. Branch and safety

```sh
cd /Users/inevix/dev/main/wishlist
git switch -c feat/migration-to-v2
git tag legacy-1.7.1 924b0e3 && git push origin legacy-1.7.1
pnpm exec wrangler whoami; cf auth whoami; gh auth status
```

The branch and tag already exist; run only the last line when resuming.

### E1. Provision (non-destructive)

```sh
cf d1 create --name wishlist-production --primary-location-hint eeur
cf d1 create --name wishlist-preview --primary-location-hint eeur
pnpm exec wrangler queues create wishlist-release-announcements
pnpm exec wrangler queues create wishlist-release-announcements-dlq
pnpm exec wrangler queues create wishlist-preview-release-announcements
pnpm exec wrangler queues pause-delivery wishlist-release-announcements
```

1. Put both D1 ids into `wrangler.jsonc` and into `env/.env.d1` (`CLOUDFLARE_AUTH_MODE=wrangler-login`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, `CLOUDFLARE_PREVIEW_DATABASE_ID`).
2. Build `.dev.vars.production` without printing anything: `BOT_TOKEN` from the legacy container environment, `ADMIN_ID` from the legacy admin id, `NEW_RELIC_LICENSE_KEY` from the princess production file, a new random `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 32`), a new `TELEGRAM_WEBHOOK_PATH` (`/telegram/` plus `openssl rand -hex 16`) and `WORKER_BASE_URL=https://wishlist.chernenko.dev`. Use `umask 077` while writing.
3. Build `.dev.vars.preview` (`BOT_TOKEN` of `@InevixTestBot`, the same `ADMIN_ID`, a new secret and path) and `.dev.vars` the same way. Confirm the preview token belongs to `@InevixTestBot` with Telegram `getMe`, without printing the token.
4. New Relic (browser): create the data partition `Log_wishlist` with 30-day retention and the rule `` `service.name` = 'wishlist' AND botEnvironment = 'production' ``.

### E2. Schema and first production deploy (webhook not set; the legacy bot still polls)

```sh
pnpm db:migrate:preview && pnpm db:migrate:prod          # 7403 on the first call: rerun
pnpm worker:deploy:prod                                  # deploy-worker.ts, secrets from .dev.vars.production
( set -a; . ./.dev.vars.production; curl -fsS -H "X-Telegram-Bot-Api-Secret-Token: $TELEGRAM_WEBHOOK_SECRET" "$WORKER_BASE_URL/health" )   # expect 200 ready:true
curl -s -o /dev/null -w '%{http_code}\n' https://wishlist.chernenko.dev/health   # expect 401
```

### E3. Preview environment and Workers Builds

```sh
pnpm worker:preview --name preview
pnpm telegram:webhook:set:preview --url https://preview-wishlist.chernenko.workers.dev --drop-pending-updates=true
pnpm telegram:commands:set:preview
```

Then follow [section 4](#4-deploy-with-workers-builds): tokens, repository connection, build configuration, build variables, preview base-config secrets. Push the branch and run `pnpm preview:point`; it waits for the `Workers Builds: wishlist` check to go green.

### E4. Rehearsal on preview (before any freeze)

```sh
pnpm db:import:preview --reset-preview --github-ref "$(gh api repos/serhii-chernenko/wishlist-db/commits/main --jq .sha)"
pnpm db:reconcile:preview
```

- The import refuses a target whose tables are not empty. Preview traffic from E3 (a `/start`, `preview:smoke`) leaves rows in `sessions` and `telegram_updates`, so the rehearsal uses `--reset-preview`. The flag is valid only for the preview target and the import script refuses it for `production` and `local`. After the import SQL is generated and validated, and before the empty-target check, it deletes every row from `sessions`, `telegram_updates`, `release_announcements`, `gives`, `wishes` and `users` of the `wishlist-preview` database. Preview data is disposable; never run the flag against a database you want to keep.
- The report printed by the import now includes `invalidLinks`: the number of wish links that were not a single valid `http` or `https` URL and were stored as NULL. Links are trimmed and reduced to the first URL, the same way the bot parses a link typed by a user.

- Check the figures in the table above. The reconciliation report must match them and `PRAGMA foreign_key_check` must be empty.
- Walk the parity checklist by hand with the preview bot in a private chat: registration (username, phone, both), wishlist with pagination, add and edit every field including a 3-photo album, visibility, filters, share through a public page (consent, link, language switcher, edit and reload, stop sharing, share again), find by `@username` and by phone, give and take, give list, payments, stats, donate, feedback, language switch, `/releases`, and an old button from chat history.
- Imported photos cannot render with the preview bot (file ids belong to the production bot); the text fallback is expected.
- Gate before the cutover: PR CI green, reviewer sign-off, approval of the copy and the changelog. Then run `pnpm changeset:version` (with `RELEASE_DATE` set to the cutover day), commit, push, and redeploy the final branch build with `pnpm worker:deploy:prod`.

### E5. Cutover (production)

1. Close the VPS deploy path for good:

    ```sh
    for s in SSH_PRIVATE_KEY VPS SSH_PORT; do gh secret delete $s -R serhii-chernenko/wishlist; done
    ```

2. **Freeze** the legacy bot and record the time:

    ```sh
    ssh -p 1708 inevix@194.163.130.87 'docker update --restart=no wishlist_bot && docker stop wishlist_bot && docker ps -a --filter name=wishlist_bot --format "{{.Status}}"'
    date -u
    pnpm telegram:webhook:info:prod
    ```

    The webhook URL must still be empty, and the pending count grows while the bot is down.

3. **Fresh export.** Trigger the backup workflow and pin the resulting SHA:

    ```sh
    gh workflow run main.yml -R serhii-chernenko/backup-dbs
    gh run watch -R serhii-chernenko/backup-dbs "$(gh run list -R serhii-chernenko/backup-dbs --workflow main.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
    SHA=$(gh api repos/serhii-chernenko/wishlist-db/commits/main --jq .sha)
    ```

    Verify that the export equals live data, which matters when backup-dbs made no new commit:

    ```sh
    ( set -a; . env/.env.mongo; mongosh "$MONGODB_URI" --quiet --eval 'printjson({u:db.users.countDocuments(),w:db.wishes.countDocuments(),g:db.gives.countDocuments(),wu:db.wishes.find().sort({updatedAt:-1}).limit(1).toArray()[0].updatedAt})' )
    MONGO_BACKUP_REF=$SHA pnpm db:import:prepare:github
    ```

    Compare the `sourceCounts` and the newest `updatedAt` of the report with the live numbers. If they differ, export locally. Only export here; do not import yet, because the Time Travel bookmark in step 4 must be taken before any import:

    ```sh
    ( set -a; . env/.env.mongo; for c in users wishes gives; do mongoexport --uri "$MONGODB_URI" --collection $c --jsonFormat=relaxed --out .mongo/$c.json; done )
    ```

    Step 5 then imports from `.mongo` instead of the pinned SHA.

4. **Time Travel bookmark.** Record it before any import, including the local-export variant:

    ```sh
    pnpm exec wrangler d1 time-travel info wishlist-production --env production
    ```

5. **Import and reconcile** (insert-only: never run it against populated tables). Import the pinned SHA:

    ```sh
    MONGO_BACKUP_REF=$SHA pnpm db:import:prod
    ```

    or, only if step 3 fell back to the local export:

    ```sh
    pnpm db:import:prod --input-dir .mongo --allow-local-production-source
    ```

    The `--allow-local-production-source` flag is mandatory for a production import from a directory and cannot be combined with a pinned `MONGO_BACKUP_REF`. Then reconcile:

    ```sh
    pnpm db:reconcile:prod
    pnpm db:query:prod --command "SELECT count(*) FROM users; SELECT count(*) FROM wishes; SELECT count(*) FROM gives;"
    ```

6. Run the health check from E2 again.
7. **Webhook:**

    ```sh
    pnpm worker:tail:prod --format json        # in the background
    pnpm telegram:webhook:set:prod --drop-pending-updates=false
    pnpm telegram:commands:set:prod
    pnpm telegram:webhook:info:prod            # repeat until pending=0 and no last_error
    ```

    The webhook is set with `max_connections=1` and `allowed_updates` `message`, `callback_query`, `my_chat_member`.

8. **Smoke test:** the admin sends `/start` to `@wishlist_ua_bot`, opens the wishlist (images must render), searches a known user, and checks give and take, a language switch, and an old button from chat history.
9. **Monitor for 60 minutes:** watch `telegram_update_dispatch_failed`, `telegram_update_lease_lost` and `telegram_update_terminalization_failed`, and the ingest freshness widget in New Relic. Check the ledger:

    ```sh
    pnpm db:query:prod --command "SELECT status,count(*) FROM telegram_updates GROUP BY status"
    ```

### E6. Go-live merge and announcement

1. Open the pull request (no attribution lines), wait for green CI and the preview check, then merge:

    ```sh
    gh pr create --base main --head feat/migration-to-v2
    gh pr merge <n> --merge
    ```

2. Workers Builds migrates (a no-op), deploys and runs `releases:broadcast:prod`. Queue delivery is still paused, so rows are only queued. The reported `inserted` may be about 0: production has run 2.0.0 since E4, so the `*/10` cron has most likely already inserted and enqueued the announcements within ten minutes of the E5 import, and the deploy-time broadcast finds nothing new (the unique index and `onConflictDoNothing` make that harmless). Do not read `inserted` as the signal. Verify the rows instead; expect about the number of registered, non-blocked users in `queued`:

    ```sh
    cf builds list --external-script-id "$WISHLIST_TAG"
    pnpm db:query:prod --command "SELECT status,count(*) FROM release_announcements GROUP BY status"
    ```

3. The GitHub `release` job publishes 2.0.0: `gh release view 2.0.0 -R serhii-chernenko/wishlist`.
4. Resume delivery and watch the statuses until no `queued` rows remain. A burst of `failed` or ambiguous rows means: pause again.

    ```sh
    pnpm exec wrangler queues resume-delivery wishlist-release-announcements
    ```

5. After 24 hours of stable operation, optionally raise concurrency by setting the webhook again with `pnpm telegram:webhook:set:prod --drop-pending-updates=false --max-connections=10`. The flag form is `--max-connections=N` with an equals sign.

### E7. Cleanup (after 24 to 48 hours of observation)

1. **VPS.** Inspect first, then remove only wishlist's own container, image and directories. Confirm that the other containers (`portfolio_*`, `courses`, `madock_*`, `aruntime-*`) are still up. No volumes or networks belong to wishlist. Do not prune shared images.

    ```sh
    ssh -p 1708 inevix@194.163.130.87 'docker ps -a; docker volume ls; docker images | grep wishlist'
    ssh -p 1708 inevix@194.163.130.87 'docker rm wishlist_bot && docker rmi wishlist_bot_image && rm -rf /home/inevix/apps/wishlist /home/inevix/apps/backup/wishlist-db && docker ps --format "{{.Names}} {{.Status}}"'
    ```

2. **backup-dbs.** In `serhii-chernenko/backup-dbs`, edit `.github/workflows/main.yml`: remove `WISHLIST: 'wishlist-db'`, the `wishlist-db` entry in `repos=(...)` and the "Backup Wishlist collections" step. Commit, push, check that the run is green, then `gh repo archive serhii-chernenko/wishlist-db --yes`. Deleting the `WISHLIST_URI` secret is optional and can wait.
3. **Wishlist repository secrets and variables:**

    ```sh
    for s in ADMIN_TELEGRAM_ID BOT_TOKEN MONGODB_URI; do gh secret delete $s -R serhii-chernenko/wishlist; done
    for v in BUYMEACOFFEE CHANNEL MONOBANK PAYPAL PRINCESS_BOT_URL WISHLIST_BOT_URL YOUTUBE; do gh variable delete $v -R serhii-chernenko/wishlist; done
    ```

4. **Preview.** `pnpm preview:reset`, then optionally `pnpm db:copy:production-to-preview --confirm-overwrite-preview` (restrict access afterwards).
5. **Docs.** Complete MIGRATION_STATUS.md (freeze time, SHA, reconciliation numbers, bookmark, broadcast result) and note in this file that backups stopped and the last snapshot is `$SHA`. Leave MongoDB Atlas untouched. Princess needs no change because the bot handle is unchanged.

## 9. Rollback

| Stage                                     | Rollback                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before E7 (legacy container still exists) | `pnpm telegram:webhook:delete:prod --drop-pending-updates=false`, then `ssh -p 1708 inevix@194.163.130.87 'docker update --restart=always wishlist_bot && docker start wishlist_bot'`. The poller resumes on untouched Mongo. D1 writes made after the cutover are not synced back: list them with `SELECT ... WHERE updated_at > <freeze>` and replay by hand if needed. Keep this window short. |
| Bad D1 data                               | `pnpm exec wrangler d1 time-travel restore wishlist-production --env production --bookmark <bookmark recorded in E5.4>`                                                                                                                                                                                                                                                                           |
| Bad Worker version after the merge        | `pnpm exec wrangler rollback --env production`, or `cf workers deployments` to pick a version. The webhook is unaffected.                                                                                                                                                                                                                                                                         |
| Mini App misbehaving                      | BotFather, Configure Mini App, Disable; or set `MINI_APP_ENABLED` to `"false"` and redeploy; or `wrangler rollback`. No data cleanup is needed (section 17).                                                                                                                                                                                                                                      |
| Broadcast going wrong                     | `pnpm exec wrangler queues pause-delivery wishlist-release-announcements`                                                                                                                                                                                                                                                                                                                         |
| After E7                                  | Rebuild the legacy bot from tag `legacy-1.7.1` on the VPS by hand. The tag still contains `.docker/` and `.ansible/`. The bot needs `BOT_TOKEN`, `MONGODB_URI` and `ADMIN_TELEGRAM_ID` in its environment and the production webhook must be deleted first. Mongo Atlas stays intact.                                                                                                             |

Time Travel restores the whole database: every write after the chosen point is lost for all users. Never automate it. To inspect a target point: `pnpm exec wrangler d1 time-travel info wishlist-production --env production --timestamp <unix seconds>`. To restore to a timestamp instead of a bookmark use `--timestamp <unix seconds>`. Record the current bookmark before restoring so that you can return to the present.

## 10. Production operations

Webhook (reads `.dev.vars.production`):

```sh
pnpm telegram:webhook:info:prod
pnpm telegram:webhook:set:prod --drop-pending-updates=false
pnpm telegram:webhook:delete:prod --drop-pending-updates=false
pnpm telegram:commands:set:prod
```

`set` and `delete` require an explicit `--drop-pending-updates=true|false`. `set` accepts `--max-connections=N` (1 to the script's limit); the default is 1. The webhook allows `message`, `callback_query` and `my_chat_member` updates only.

Health check (200 only with the correct secret, 401 without):

```sh
curl -H "X-Telegram-Bot-Api-Secret-Token: $TELEGRAM_WEBHOOK_SECRET" https://wishlist.chernenko.dev/health
```

Logs:

```sh
pnpm worker:tail:prod
```

Or open Workers Observability in the Cloudflare dashboard (logs on, traces off).

Manual deploy fallback when Workers Builds is down (uses `.dev.vars.production` as the secrets file):

```sh
pnpm worker:deploy:prod
```

Queries (production queries are live; prefer `select`):

```sh
pnpm db:query:prod --command "select count(*) from users"
pnpm db:query:preview --command "select count(*) from users"
```

Feedback goes to the Telegram user in the `ADMIN_ID` secret. That user must have started a chat with the bot once, or Telegram refuses the delivery.

## 11. Releases and announcements

Add a changeset with `pnpm changeset:add`. Every bullet is written in Ukrainian, tagged, and followed by nested translation lines:

```md
---
'wishlist': minor
---

- [added] Український текст.
    - en: English text.
    - pl: Polski tekst.
```

Tags: `added`, `updated`, `fixed`, `removed`, `notes`. Validate with `pnpm changeset:validate`. `releases.generated.json` is generated: never edit it by hand. `CHANGELOG.md` is the human-owned history.

Cut a release:

```sh
pnpm changeset:version
```

It validates the changesets, runs `changeset version`, stamps the changelog, regenerates `releases.generated.json` (`releases:sync`) and updates the lockfile. If it fails locally, edit `CHANGELOG.md` by hand in the same format and run `pnpm run releases:sync`.

### Announcements

- After the production deploy, the deploy command runs `pnpm releases:broadcast:prod`, which calls `POST /admin/release-broadcast` (requires the webhook secret header; 401 on a wrong secret, 409 while `ENABLE_RELEASE_BROADCAST` is off). The `*/10 * * * *` cron runs the same producer as a fallback, because crons are not fully reliable.
- The producer compares the newest manifest version with each registered, non-blocked user's `release_version`. A user on a lower version gets one `release_announcements` row (unique per version and user) and one queue job on `wishlist-release-announcements`.
- The consumer sends the notes in the user's language (`users.language`, or Auto from the stored Telegram language code) and stores the new version on the user.
- Delivery is at-most-once on ambiguity: a duplicate is worse than a missed message. A network error with no response, a 5xx, or a redelivery of a row in `sending` is marked `skipped` and never resent. A 403 sets `users.blocked_at` and skips; a permanent 400 skips; any other 400 marks the row `failed`. A 429 re-enqueues the job after `retry_after + 1` seconds.
- Stale recovery: each cron run re-enqueues `queued` rows untouched for over 3 hours and marks `sending` rows stuck over 3 hours as `skipped`.
- Per-user results are in `release_announcements`:

    ```sh
    pnpm db:query:prod --command "SELECT status,count(*) FROM release_announcements GROUP BY status"
    ```

Hold a broadcast back by pausing queue delivery before the merge, then resume it once the deploy looks healthy:

```sh
pnpm exec wrangler queues pause-delivery wishlist-release-announcements
pnpm exec wrangler queues resume-delivery wishlist-release-announcements
```

The kill switch variable `ENABLE_RELEASE_BROADCAST` (`"true"` in production in `wrangler.jsonc`) needs a redeploy to take effect. While it is off the consumer sends nothing and retries each message after 600 seconds, so jobs eventually reach the dead-letter queue. Prefer pausing the queue for an emergency stop.

### GitHub releases

The same `CHANGELOG.md` entries are published as GitHub Releases, using the English text of each bullet. The `release` job in `.github/workflows/main.yml` runs after `validate` passes on every push to `main` and calls `pnpm releases:github`. The first automatic version is `2.0.0` (`FIRST_AUTOMATIC_VERSION`); earlier versions are never published automatically. The tag is named like the version and points at the `main` commit that published it. Versions that already have a release are skipped, so a push that does not touch `CHANGELOG.md` only logs `already exists; skipping`. The workflow only publishes notes; it does not deploy.

## 12. Share pages and home pages

The Worker serves a public page for every list that its owner shared, and a home page about the bot in each language. The pages are server-rendered with Hono JSX (`src/web`), have no client JavaScript, and share the Worker, the D1 binding and the telemetry with the bot.

The URL segment for Ukrainian is `ua` on purpose (`/ua`, `/ua/w/<id>`), while the language itself stays `uk` everywhere else: `<html lang>`, `hreflang`, `Content-Language`, the cache key, telemetry and the database. The mapping lives in one place, `LANGUAGE_URL_SEGMENTS` in `src/web/share/public-id.ts`.

### Routes

| Route                | Behavior                                                                                                                                                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`              | `302` to `/ua`, `/en` or `/pl` by the best match of `Accept-Language` (same matcher as `/w/<id>`), else `/ua`. `Vary: Accept-Language`, `Cache-Control: private, no-store`. It is the `x-default` alternate of the home pages                                         |
| `GET /<lang>`        | The home page, with `lang` in `ua`, `en`, `pl`. `/<lang>/` gets a `301` to `/<lang>`. No D1 read                                                                                                                                                                      |
| `GET /w/<id>`        | The link the bot hands out. `302` to `/<lang>/w/<id>`, where the language is the best match of `Accept-Language` among `uk`, `pl`, `en`, else the owner's language. `Vary: Accept-Language`, `Cache-Control: private, no-store`. It is also the `x-default` alternate |
| `GET /<lang>/w/<id>` | The page, with `lang` in `ua`, `en`, `pl`. An uppercase id gets a `301` to the lowercase URL                                                                                                                                                                          |
| `GET /uk/...`        | Legacy URLs: `/uk/w/<id>` gets a `301` to `/ua/w/<id>` (lowercased id), `/uk` and `/uk/` get a `301` to `/ua`                                                                                                                                                         |
| `GET /status`        | The JSON `{"service":"wishlist","runtime":"cloudflare-workers","status":"runtime-ready"}`, used by `pnpm preview:wait` and `preview:point` as the first readiness check                                                                                               |
| `GET /robots.txt`    | Generated per environment (see Indexing)                                                                                                                                                                                                                              |
| `GET /sitemap.xml`   | Only on the production host: the three home pages with their `hreflang` alternates. `404` elsewhere                                                                                                                                                                   |
| `GET /currency`      | The currency switcher target (`set` is `auto`, `UAH`, `USD`, `EUR` or `PLN`, `back` is a same-origin path checked by `toSafeBackPath`). `303` back to the page with a `currency` cookie (see Currency on share pages). `Cache-Control: no-store`, `noindex`           |

An id that does not match `^[0-9a-hjkmnp-tv-z]{26}$`, an unknown id, or a list of a blocked owner answers `404`. A stopped share answers `410`. Both are `noindex` and `no-store`. The page itself shows only wishes that are neither hidden nor removed (at most 100, with a notice when there are more), their photos (see Photos on share pages), the name saved at consent, the `@username` only if the owner switched it on for the share (`wishlist_shares.show_username`, off by default) and is currently searchable by username, and the owner's payment details. It never shows the phone number, the delivery address, the give list or givers. When the owner has switched `show_gifted` on, the gifted wishes follow the active ones (see Gifted wishes on share pages), and each wish carries a priority badge (see Priority on share pages).

### Ids

`wishlist_shares.public_id` is a lowercase ULID (`ulid` package, Web Crypto): 26 Crockford base32 characters, of which the first 10 are a 48-bit millisecond timestamp and the last 16 are 80 random bits. The random part cannot be guessed or walked, unlike a sequential id. The time part does reveal when the share (or the latest "New link") was created, to the millisecond. That is accepted. URLs never contain names or usernames.

Lifecycle:

- The id is created on the first share. Pressing Share again returns the same URL.
- Stop sharing sets `revoked_at`, clears `display_name`, resets `show_username` to off; the page answers `410`.
- Sharing again clears `revoked_at`, so the old link works again and old recipients regain access.
- "New link" replaces `public_id` after a confirmation, for a link that leaked. The old link answers `404`.
- The bot builds the URL from the origin of the webhook request, not from a variable, so a branch preview hands out its own `workers.dev` host.

### Caching

Each page has a fingerprint, the first 16 bytes (hex) of a SHA-256 over: the deploy id (`CF_VERSION_METADATA.id`), the language, the display currency of the request (the `currency` cookie or the language default), the exchange rate date and values (section 18), the public id, the share's `updated_at`, `show_username`, `allow_indexing`, the username (only if switched on and searchable), `show_payments`, the payment details (only if shown), the delivery hint flag (a boolean), the number of visible wishes, the latest `updated_at` among visible wishes, `show_gifted`, the number of visible gifted wishes and the latest `updated_at` among them. The phone number and the delivery address are deliberately not inputs: only the boolean hint is. Any wish change, payment or disclosure change, indexing toggle, gifted change, every rates refresh and every deploy therefore produces a new fingerprint. Gives and a profile sync that only touches last-seen do not.

The fingerprint then gets a variant suffix for an explicit theme cookie and for an explicit currency cookie (`variantFingerprint`), so every visitor variant has its own `ETag` and cache key. Cookies are never sent to the cache itself.

- The fingerprint is the `ETag`. Browsers get `Cache-Control: no-cache`, revalidate, and receive `304` on a match.
- The rendered HTML is stored in the Cache API (`caches.default`) under `<origin>/__share-cache/<lang>/<id>/<fingerprint>` with `Cache-Control: public, max-age=86400` and never with cookies. A change makes a new key, so no purge is needed; old entries expire after 24 hours.
- Every `200` carries `Server-Timing: share-cache;desc=hit|miss|bypass`. The second view of an unchanged page must show `hit`.
- The Cache API is per data center, so each data center renders once per fingerprint.
- Home pages use the same mechanism with a fingerprint over the deploy id and the language only, stored under `<origin>/__share-cache/home/<lang>/<fingerprint>`. They change only with a deploy.
- **Cache API caveat.** It does nothing on `*.workers.dev`. Previews always render and report `miss`. Verify caching only on `https://wishlist.chernenko.dev`.
- `D1` is read twice on a miss (fingerprint, then wishes) and once on a hit or a `304`.

### Indexing and privacy

- A page is `index, follow` only when `BOT_ENVIRONMENT` is `production`, the request host is exactly `wishlist.chernenko.dev`, the list has at least one visible wish and the owner has not turned search indexing off (`wishlist_shares.allow_indexing`, default on; section "Search indexing toggle" below). Everything else (previews, `*.workers.dev` version URLs, empty lists, indexing off, `404`, `410`) is `noindex`. Canonical and `hreflang` links always use the request origin.
- Home pages are `index, follow` under the same production host rule (without the wish count condition) and carry `hreflang` for `uk`, `en`, `pl` plus `x-default` (`/`), Open Graph and Twitter tags, and one JSON-LD `SoftwareApplication` block (`<script type="application/ld+json">`, a data block the CSP does not need to allow).
- `robots.txt` allows `/`, disallows `/__share-cache/`, `/app`, `/api/`, `/img/` (so photos stay out of image search), `/theme` and `/currency` and points to `https://wishlist.chernenko.dev/sitemap.xml` on the production host, and disallows everything elsewhere. The sitemap lists only the three home pages, never share pages, so lists are never enumerated.
- The first Share shows a consent screen: the Telegram profile name, visible wishes and payment details (only if added and switched on) become public, anyone with the link can open the page, search engines may index it, and sharing can be stopped at any time. The screen states that the phone number, the delivery address and the give list are never shown on the page; if the owner turns the phone and address on, only people in Telegram see them (see Contact details below). The `@username` is listed there as shown only if the owner switches it on (a button on the link screen, offered only to owners who are searchable by username; the choice is forgotten when sharing stops). The name is saved as `display_name` (64 characters at most), refreshed silently on later shares and deleted when sharing stops.
- Pages send `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` and a CSP with `default-src 'none'` and `style-src 'self'` (no inline styles). Owner links get `rel="nofollow ugc noopener noreferrer"`.
- Telemetry never contains the public id (the path is normalized to `/w/:publicId`; home pages are normalized to `/:lang`; photo requests to `/img/s` and `/img/w`). Cloudflare invocation logs do contain the path, including `/img/s/<publicId>/...`, as they already do for the webhook path.
- Old telegra.ph pages stay online but are no longer updated.

### Search indexing toggle

`wishlist_shares.allow_indexing` (default on) is switched in the bot (the "What others see" screen that the share link keyboard opens) and in the app (the "What others see" section of the share screen). The explanation shown next to it says that payment details on the page may appear in search results and that turning it off adds `noindex`, but copies that search engines already hold take time to disappear. The flag is part of the page fingerprint, so the new `robots` meta is served immediately. Stopping sharing does not reset it. The toggle emits no dedicated telemetry event yet.

### Contact details in Telegram

The phone number and the delivery address never leave Telegram. They are not rendered on any web route (the share page, `404`, `410`, `HEAD` and cached copies are all tested against distinctive values), are not inputs of the fingerprint, are not stored in the Cache API, and never appear in telemetry or logs.

- The owner controls three disclosure flags on `users` (bot: "What others see"; app: the same section): `show_payments` (default on), `show_phone` and `show_address` (default off). The address can be shown only together with a visible phone: turning the phone off turns the address off, a phone reset or a switch to a different number (compared by normalized digits) clears both flags, and removing the address clears `show_address`. Turning the address on while the phone is off turns the phone on too (`planDisclosure`, one `contact_disclosure_changed` event per flag that changed); the single confirmation, in the bot and in the app, names both the phone and the address. Without a stored phone the `phoneMissing` notice applies instead. Each switch on needs a yes or no confirmation that names who can see the data: anyone who opens the list in Telegram, by the link or by searching the owner's username or number.
- `resolveOwnerContact` (bot and API call the same code) returns contact only for a registered, non-blocked viewer who is not the owner, and only with the first page of the list. A guest following `startapp=s_<publicId>` and any viewer without a `users` row get payments only, if `show_payments` is on. The app envelope shows Call and Copy rows; the bot shows the contact block with the address escaped by `escapeHtml`.
- The web page shows only the line "Delivery details are available in Telegram" (with a link to the Mini App) when `show_phone` is on and the owner has a phone. It sits under the payments envelope, or alone when payments are off. The page cannot tell whether an address exists.
- A viewer's Telegram chat keeps messages that were already sent; the confirmation says so.
- The address rejects anything Telegram would turn into a clickable link: a URL scheme, `http`, `www.`, `t.me` or `telegram.me`, `tg:`, an `@mention` and a bare domain with a common TLD (`parseAddress`, shared by the bot and the app; a server-side line-count violation is the field error `tooManyLines`). The bot's contact message is sent with link previews disabled.
- Phone search (bot and `/api/search`) is one shared rule, `parseFindQuery` in `src/bot/input/find-query.ts`, and it is an exact match on `users.phone_digits`: never a prefix, a middle part or trailing digits. Only text made of digits, spaces, dashes, parentheses and an optional leading `+` is read as a phone; anything else is a username query, so letters mixed with digits never reach the phone column. The digits are normalized as follows: 11 to 15 digits are a full international number; exactly 10 digits starting with `0` are a Ukrainian national number and get the prefix `38` (`0501234567` becomes `380501234567`); exactly 9 digits get the country code of the searcher, `48` when the searcher's language is Polish (or, for other languages, the display currency is `PLN`) and `380` when it is Ukrainian (or the currency is `UAH`); the language wins over the currency. Anything else, such as 9 digits from an English-language searcher with a `USD` or `EUR` currency, a 10-digit number not starting with `0`, or fewer than 9 digits, answers `needsCountryCode` ("add the country code") without querying the database; more than 15 digits answer `notFound`. Bot searches use `APP_SENSITIVE_LIMITER` with the same `tg:<telegramId>` key as the app, so both channels share the 10 per minute budget; a refused bot search answers "too many searches" (`wishlist_searched` with `result` `rateLimited`) and keeps the search prompt.
- A non-admin who opens their own share link (`startapp=s_<publicId>`) never sees the third-party view: `GET /api/app/shared/:publicId` answers `ownList: true` with a null token and the app replaces the screen with "My wishes". Shared wishes never carry `givers` anyway, so no reservation is exposed. The admin keeps the regular third-party view of their own list. The bot has no share deep link.
- App photo URLs minted for other people's lists carry `a=v`, which is part of the HMAC message. Such a URL serves a photo only while the wish is still visible to others: not hidden, owner not blocked, and a gifted wish only while the owner keeps `show_gifted` on. Owner URLs (no `a`) keep the owner rules, so the owner still sees hidden and gifted photos.

### Currency on share pages

The top bar has a currency switcher between the theme and language switchers (`₴ $ € zł`, plus an auto option; the full name is in `aria-label` and `title`). It links to `GET /currency?set=<choice>&back=<path>`, which answers `303` and sets the `currency` cookie (`Path=/; SameSite=Lax; Secure`, one year; `auto` clears it). Without the cookie the language default applies: `uk` shows `UAH`, `en` shows `EUR`, `pl` shows `PLN`. Each wish is converted from its own currency (section 18). The choice is part of the fingerprint through the display currency and the variant suffix, and `share_page_served` reports `displayCurrency` and `currencySource` (`cookie` or `language`).

### Priority on share pages

The priority badge is the single priority signal: wishes with priority low, medium or high carry a colored badge with a text label and an icon, and wishes without priority carry nothing. There is no heart sticker or heart toggle on the cards, because a heart reads as a favorite. The icons are static files `public/icons/signal-{low,medium,high}.svg` applied as CSS masks, so a badge costs almost no HTML. The badge fills keep a text contrast of at least 7:1 in both themes (`test/priority-styles.test.ts`). On the owner's cards in the Mini App a round outlined `signal` button opens a bottom sheet with the same four priority rows as the wish editor; third-party views and the share page have no button.

### Gifted wishes on share pages

A gifted wish is a removed wish that was removed as done (`removed = 1`, `done = 1`). The owner decides per list (`users.show_gifted`, on for every user: registration and the Mongo import write `1` explicitly, migration `20261004111004_show_gifted_default_on` switched existing rows on, and the schema default stays `0` because SQLite can change a column default only by rebuilding the table; toggle in the app share screen and the bot share keyboard) whether gifted wishes follow the active ones on the page, and per wish (`wishes.gifted_hidden`) whether one of them is hidden. The section shows at most 30 wishes (`APP_THIRD_PARTY_GIFTED_LIMIT`), newest first, as compact cards (no buy link and no details) under a "Gifted" band that is drawn by CSS. `/img/s` serves their photos only while the owner has `show_gifted` on and the wish is not hidden from the section. Three fingerprint inputs track the section: `show_gifted`, the number of visible gifted wishes and the latest `updated_at` among them.

### Photos on share pages

- Each wish card shows its photos through the image proxy, as `<img>` tags with `/img/s/<publicId>/<wishId>/<index>/<hash>`, `loading="lazy"` and alt text. The wishes sit in a compact card grid that breaks out of the text column: 1 column below about 26rem, 2 above, 3 from about 64rem, 4 from about 80rem. A wish without photos shows the logo heart placeholder. When the proxy cannot get a photo from Telegram it answers a grey logo placeholder SVG; the share page appends `?t=light|dark` to the photo URLs when the visitor chose a theme, the Mini App appends its current theme to `/img/w` and `/img/s` URLs, and the proxy paints that palette (without `t` the SVG follows `prefers-color-scheme`). `t` is advisory and never part of a signed payload, so signed `/img/w` URLs stay valid. The palette lives in the `--photo-placeholder`, `--photo-placeholder-fill` and `--photo-placeholder-ink` tokens in `src/web/styles/gift-tag.css` and mirrors `PLACEHOLDER_LIGHT` and `PLACEHOLDER_DARK` in `src/shared/photo-placeholder.ts` (`test/photo-placeholder.test.ts`). Gifted cards mute only the `img`, never the placeholder wrapper. Description and dates fold into a `<details>` element, so no JavaScript is needed. For 20 maximum-size wishes with a badge on every card the HTML stays under 20 KB gzip (100 KB raw), a hard gate in `test/web-render.test.tsx`; a gifted section at its cap of 30 compact cards has its own test.
- The proxy is the only way a photo leaves the Worker. It checks D1 live on every request: the share must be active, the owner not blocked, and the wish visible and owned by the share owner, and `<hash>` must equal the first 16 hex characters of SHA-256 of the stored `file_id` at that index. Anything else answers `404`, so a stopped share, a hidden wish or a replaced link serves no photo even if the page itself is still cached. Share image URLs have no expiry; they are not secret, they are authorized by the live check.
- Responses carry `Content-Security-Policy: default-src 'none'; sandbox`, `X-Content-Type-Options: nosniff` and `Cache-Control: public, max-age=3600`. Bytes come from the Cache API, then from R2, and only on a miss from Telegram (section 17). Every request is limited by the `IMAGE_PROXY_LIMITER` binding per client IP hash before the D1 lookup, and a request without `cf-connecting-ip` is answered `429`.
- Photos change `wishes.updated_at` (through `appendImage`), so the page fingerprint already changes with them and no purge is needed.
- Photos are never listed in `sitemap.xml`, and `/img/` is disallowed in `robots.txt`.
- The page also has a secondary link that opens the list in the Mini App (`https://t.me/wishlist_ua_bot?startapp=s_<publicId>`). In previews it points to the production bot, which shows "not found".

### Assets and data

- `public/` (favicon, Apple touch icon, OG image, `styles/share.css`, `app/app.js` and `app/app.css`) is served by the `assets` binding. The icons and the OG image are made from the bot avatar.
- `public/styles/share.css` is generated and committed: `pnpm run css:build` compiles `src/web/styles/share.css` (Tailwind CSS 4 with the gift-tag component partials `fonts.css` and `gift-tag.css` and plain CSS custom properties for the light and dark tokens; sources `src/web/**/*.ts(x)`). It does not use daisyUI; daisyUI 5 with the custom themes `wishlist` and `wishlist-dark` lives only in the Mini App stylesheet `public/app/app.css` (section 17). `css:build` builds both files, and CI fails on drift. Pages link the share stylesheet as `/styles/share.css?v=<deploy id>`. Every text and background pair of the share tokens meets WCAG AAA (7:1); `test/share-styles.test.ts` enforces it, and `test/app-styles.test.ts` enforces it for the app themes and checks they match the share tokens.
- `pnpm db:copy:production-to-preview` copies `users`, `wishes` and `gives`, deliberately not `wishlist_shares`, so no public id of a real list exists in preview. Create shares in preview through the preview bot.

### Production rollout

1. Apply the `wishlist_shares` migrations to production D1 before the code that reads it is deployed: `pnpm db:migrate:prod`, then `pnpm worker:deploy:prod`. This is an explicit exception to the "no manual production migration before a merge" rule, approved for this release. The migration is additive. The batch 2 migrations (indexing flag, gifted flags and the rest) ride along with the Mini App rollout: the bookmark, counts, verification and the post-deploy priority repair are in section 17, "R4 in detail".
2. Smoke test as the admin: Share, consent, open the link twice (the second view shows `share-cache;desc=hit`), edit a wish and reload, stop (`410`), share again.
3. Check that `share_page_served` events reach New Relic (page `Share pages` of the dashboard).

## 13. Observability

Workers Logs stay enabled in every environment; Workers traces are disabled (`observability.traces.enabled: false` in every wrangler block) because Telegram API calls carry the bot token in the URL path (`api.telegram.org/bot<token>/...` and `/file/bot<token>/...`), and traces record outgoing fetch URLs. Do not re-enable traces without scrubbing those URLs first. The Worker emits one safe evlog wide event for each HTTP request, Telegram webhook outcome, scheduled run, release broadcast and release-announcement queue batch. In production, evlog's OTLP drain sends them to New Relic. The `NEW_RELIC_LICENSE_KEY` secret exists only on the production Worker and in the ignored `.dev.vars.production`. Delivery is registered with `waitUntil`, and a drain failure only produces a local warning.

Use the `Log_wishlist` data partition (30-day retention) with the rule `` `service.name` = 'wishlist' AND botEnvironment = 'production' ``. Filter by the same attributes in queries. `eventName`, `outcome`, `elapsedMs`, `commandCategory`, `callbackCategory`, `errorType` and the counts are top-level attributes for NRQL. The measured duration is `elapsedMs`: evlog overwrites `durationMs` and `duration` with its own near-zero elapsed time when an event is emitted, so never chart those two.

Telemetry never contains Telegram identifiers, message text, webhook paths, headers, wish contents, payment details, share page public ids or secrets. `callbackCategory` is a closed prefix such as `wish:edit`, `third:give` or `language:set`, `legacy` or `invalid`, never an id.

Dashboard (import template `docs/newrelic-dashboard.json`; queries read `Log_wishlist`, not the default `Log` event type). One dashboard, `Wishlist Bot`, with six pages and 102 widgets in the template (the live dashboard was updated to match with NerdGraph `dashboardUpdate`, keeping the GUID), live at <https://one.eu.newrelic.com/dashboards/detail/ODU2OTkwOHxWSVp8REFTSEJPQVJEfGRhOjI3NjIyMzA?account=8569908>:

| Page        | Widgets | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production  | 16      | Ingest freshness and rate, webhook failures, outcomes and latency (`elapsedMs`), idempotency outcomes, rejected webhook reasons, processing and Worker errors, scheduled heartbeat and duration, release broadcast coverage, release queue failures, wishes created per day, update and command mix, HTTP 5xx                                                                                                                                                                                                                                                                                                                                                              |
| Audience    | 15      | Registered and blocked users, active users over 1, 7 and 30 days, snapshots in the last hour, users by language, wishes in the system, hidden and priority wishes, gives, users with payment details, new registrations                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Actions     | 18      | Wishes created, updated and removed, gives added and removed, feedback, updates by field, searches by result (`found`, `notFound`, `self`, `tooLong`), shares by result (`published`, `existing`, `empty`, `failed`), callback mix, pages, filters and language changes, payments, update types, commands by category (real commands only)                                                                                                                                                                                                                                                                                                                                 |
| Share pages | 8       | Page views and cache hit ratio (30 days), page errors, views per day by result, latency p50 and p95 by cache outcome, views by locale, 404 and 410 per day, shares published, stopped and rotated per day                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Mini App    | 17      | Sessions (7 days), API 5xx and rate limited counts, sessions per day by platform, start kinds, API requests by route and status, API latency p50 and p95 by route, 5xx per day by route, auth rejections by reason, rate limited and rate limiter missing by bucket, actions by channel and action, photo uploads by result, image proxy hit ratio, latency and results by scope, client errors by kind and screen (`screenView` and `validationFailed` are excluded here and charted on `Usage & UX`)                                                                                                                                                                     |
| Usage & UX  | 28      | Active users by channel (bot only, app only, both) for 1, 7 and 30 days as billboards and timeseries from the snapshot, users who ever opened the app and the adoption percentage, app sessions per day by start kind, by platform, theme, locale and guest or registered, screen views by screen and per day, validation errors by field and code, top actions by channel (`wish_created`, `give_added`, `wishlist_shared`, `wishlist_searched`), the share funnel (share page views, app sessions with start kind `share`, gives added in the app), photo uploads by result and client upload failures, API p95 by route and over time, client errors by kind and screen |

A data partition receives data only from its creation time, so events sent before `Log_wishlist` existed stay in `Log`; query `FROM Log, Log_wishlist` for the full history.

Key event names:

| Group             | Events                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Webhook           | `telegram_webhook_completed`, `telegram_update_dispatch_failed`, `telegram_update_lease_lost`, `telegram_update_terminalization_failed`, `telegram_update_ledger_unavailable`, `telegram_update_claim_reclaimed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| HTTP and worker   | `http_request_completed`, `http_request_failed`, `worker_readiness_check_failed`, `worker_readiness_auth_failed`, `worker_admin_auth_failed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Scheduled         | `scheduled_worker_invoked`, `scheduled_run_completed`, `scheduled_run_failed`, `telegram_update_ledger_pruned`, `sessions_pruned`, `sessions_prune_failed`, `exchange_rates_refresh` (section 18)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Release broadcast | `release_broadcast_completed`, `release_broadcast_failed`, `release_broadcast_skipped`, `release_broadcast_stale_recovered`, `release_announcement_sent`, `release_announcement_skipped`, `release_announcement_failed`, `release_announcement_ambiguous`, `release_announcement_handler_error`, `release_announcement_state_write_failed`, `release_announcement_rate_limited`, `release_announcement_invalid_job`, `release_announcement_stale_job`, `release_announcement_notes_missing`, `release_announcement_queue_batch_completed`, `release_announcement_queue_batch_failed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Bot behavior      | `bot_action_completed` with `action` one of `user_registered`, `visibility_changed`, `wish_created`, `wish_updated`, `wish_removed`, `wishlist_cleaned`, `wishlist_shared`, `wishlist_share_stopped`, `wishlist_share_rotated`, `wishlist_share_username_toggled`, `wishlist_filtered`, `wishlist_searched`, `give_added`, `give_removed`, `give_list_cleaned`, `payments_updated`, `payments_removed`, `feedback_sent`, `language_changed`, `currency_changed`, `wish_priority_set`, `wish_images_reordered`, `contact_disclosure_changed`, `delivery_address_updated`, `delivery_address_removed`, `wish_restored`, `gifted_hidden`, `show_gifted_changed`, `wishlist_share_indexing_toggled`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Share pages       | `share_page_served` with `result` one of `rendered`, `cached`, `notModified`, `redirected`, `notFound`, `gone`, `error`, `cacheOutcome` one of `hit`, `miss`, `bypass`, plus `locale`, `status`, `elapsedMs`, `visibleWishes`, `displayCurrency` (one of `UAH`, `USD`, `EUR`, `PLN`) and `currencySource` (`cookie` or `language`). The path is always the normalized `/w/:publicId`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Mini App          | `app_session_started` (`platform` one of `ios`, `android`, `tdesktop`, `macos`, `weba`, `webk`, `unknown`; `startKind` one of `none`, `wish`, `share`, `screen`; `isGuest`; `locale`; `theme` one of `light`, `dark`, `unknown`, sent by the client as the bootstrap `theme` query parameter), `app_api_completed` (`route` is the route template such as `/api/app/wishes/:id`, `method`, `status`, `outcome`, `errorCode`, `elapsedMs`), `app_auth_rejected` (`reason` one of `missing`, `malformed`, `badHash`, `stale`, `future`, `previewAccessDenied`, `origin`), `app_rate_limited` and `app_rate_limiter_missing` (`bucket` one of `api`, `sensitive`, `upload`, `image`, `import`), `app_photo_uploaded` (`result` one of `appended`, `duplicate`, `full`, `tooLarge`, `unsupported`, `writeAccessRequired`, `telegramError`, `carrierKept`), `image_proxy_served` (`scope` `app`, `share` or `import`, `result` one of `hit`, `miss`, `notFound`, `forbidden`, `expired`, `upstreamError`, `placeholder`, `rateLimited`, `status`, `elapsedMs`), `app_client_event` (`kind` one of `renderError`, `networkError`, `sdkUnsupported`, `uploadFailed`, `screenView`, `validationFailed`; `screen` from a closed set that includes `settings`, `currency` and `delivery`; for `validationFailed` also `field` one of `title`, `description`, `price`, `link`, `query`, `payments`, `feedback`, `address` and `code` one of the field error codes such as `tooLong` or `containsLink`, never the typed value) |
| Telemetry itself  | `new_relic_drain_failed`, `telemetry_emit_failed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Action labels added by batch 2 (closed values only):

| Action                                                  | Labels                                                                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `currency_changed`                                      | `result` is the new display currency: `UAH`, `USD`, `EUR` or `PLN`                                                   |
| `wish_priority_set`                                     | `result` is `none`, `low`, `medium` or `high`. Sent by the bot menu and by the app when an edit changes the priority |
| `wish_images_reordered`                                 | `result` is `first` from the bot "Make photo N first" button, or `drag`, `keyboard` or `button` from the app         |
| `contact_disclosure_changed`                            | `field` is `payments`, `phone` or `address`, `result` is `on` or `off`. One event per flag that actually changed     |
| `delivery_address_updated`, `delivery_address_removed`  | No labels. Never the address                                                                                         |
| `wish_restored`, `gifted_hidden`, `show_gifted_changed` | `gifted_hidden` and `show_gifted_changed` carry `result` `on` or `off`                                               |

Callback categories added by batch 2: `wishlist:shareIndexing`, `wishlist:shareGifted`, `wish:priorityMenu`, `wish:prioritySet`, `wish:currency`, `wish:imagesOrder`, `wish:imageFirst`, `currency`, `disclosure:toggle`, `disclosure:confirm` and `delivery:remove`. The old `wish:priority` category no longer exists. Telemetry never carries a phone number, an address, a hash or an id.

Channel. `bot_action_completed` carries `channel` (`bot` or `app`). Events from the webhook send `bot`, and actions taken through the API send `app`, so the existing action widgets count both; split them with `FACET channel`. Mini App paths are normalized to `/app`, `/api/app`, `/img/w` and `/img/s`; the route detail is in the `route` attribute. Mini App events contain only closed labels: no initData, `Authorization` header, Telegram ids, wish ids, public ids, search queries, text or URLs.

Sample queries:

```sql
SELECT percentile(elapsedMs, 50, 95) FROM Log_wishlist WHERE eventName = 'app_api_completed' AND botEnvironment = 'production' FACET route SINCE 1 day ago
SELECT count(*) FROM Log_wishlist WHERE eventName = 'bot_action_completed' AND botEnvironment = 'production' FACET channel, action SINCE 7 days ago
SELECT count(*) FROM Log_wishlist WHERE eventName = 'bot_action_completed' AND action = 'currency_changed' AND botEnvironment = 'production' FACET result, channel SINCE 7 days ago
SELECT count(*) FROM Log_wishlist WHERE eventName = 'bot_action_completed' AND action = 'contact_disclosure_changed' AND botEnvironment = 'production' FACET field, result SINCE 7 days ago
SELECT count(*) FROM Log_wishlist WHERE eventName = 'bot_action_completed' AND action = 'wish_priority_set' AND botEnvironment = 'production' FACET result SINCE 7 days ago
SELECT count(*) FROM Log_wishlist WHERE eventName = 'share_page_served' AND botEnvironment = 'production' FACET displayCurrency, currencySource SINCE 7 days ago
SELECT count(*) FROM Log_wishlist WHERE eventName = 'bot_action_completed' AND action IN ('delivery_address_updated', 'delivery_address_removed', 'wish_images_reordered', 'show_gifted_changed', 'gifted_hidden') AND botEnvironment = 'production' FACET action, channel SINCE 7 days ago
```

State snapshot and heartbeat. Each run of the `*/10 * * * *` cron emits `bot_state_snapshot` after reading aggregate counts from D1: registered, blocked and active (1, 7, 30 days) users, active users per channel for the same windows (`botOnlyUsers*`, `appOnlyUsers*`, `bothChannelUsers*`, plus `appUsersTotal` for users who ever opened the app), total, active, hidden, high-priority (`priority_level = 3`) and done wishes, gives, users with payment details, and a user count per language (`uk`, `en`, `pl`, `auto`). The channel counts come from two timestamps on `users`: `last_bot_seen_at` is written by the bot profile sync and `last_app_seen_at` by the API middleware after authentication of a registered user, each at most once per hour; the migration backfilled `last_bot_seen_at` from `last_seen_at`, and `last_app_seen_at` stays `NULL` until the user opens the app. A user is active in a channel when its timestamp falls inside the window and the user is not blocked; no identities leave D1. The snapshot doubles as the cron heartbeat: use the `Snapshots in last hour` widget to catch missing cron activity. A snapshot failure emits `bot_state_snapshot_failed` and does not fail the broadcast or maintenance. A zero error count does not prove that the drain works, so check ingest freshness and the latest scheduled run together when data seems missing.

Princess's imported dashboards got `Edit - everyone in account` permission from New Relic. If the wishlist dashboard gets the same, limit New Relic account membership to trusted operators.

## 14. Troubleshooting

| Symptom                                                                           | Likely cause                                                                                                               | Fix                                                                                                                                      |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| D1 error `7403` on the first call                                                 | Transient D1 error on the first call of a session                                                                          | Rerun the same command. `db:migrate:ci` retries it itself                                                                                |
| `Invalid access token`                                                            | Expired `wrangler login`                                                                                                   | `pnpm exec wrangler login`                                                                                                               |
| Build fails with `Missing script: db:migrate:ci`                                  | Build command was switched before the script reached the built branch, or a legacy `main` build                            | Expected for legacy `main` before the go-live merge. Otherwise rebase the branch or restore the previous build command                   |
| Production deploy fails on required secrets                                       | One of `ADMIN_ID`, `BOT_TOKEN`, `NEW_RELIC_LICENSE_KEY`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_PATH` is missing     | `printf %s "$VALUE" \| pnpm exec wrangler secret put NAME --env production`                                                              |
| `db:migrate:ci` refuses to run                                                    | Not inside Workers Builds, empty `WORKERS_CI_BRANCH`, or database ids missing or equal                                     | Use `db:migrate:prod` or `db:migrate:preview` locally; fix the build variables                                                           |
| Second concurrent preview build fails on duplicate DDL                            | Two branch builds raced on the same new migration                                                                          | Rerun the failed build                                                                                                                   |
| `/health` returns 401                                                             | Missing or wrong `X-Telegram-Bot-Api-Secret-Token` header                                                                  | Send the correct secret. 401 without the header is expected                                                                              |
| `pnpm preview:point` times out                                                    | The Workers Builds check did not finish, or the preview does not answer on `/health`                                       | Check the PR comment for the preview URL, then `pnpm telegram:webhook:set:preview --url <url> --drop-pending-updates=true`               |
| `preview:point` refuses to change the webhook                                     | The token in `.dev.vars.preview` is not `@InevixTestBot`'s                                                                 | Fix `.dev.vars.preview`                                                                                                                  |
| Bot does not answer, `getWebhookInfo` shows `last_error`                          | Wrong URL, secret or path, or the Worker is failing                                                                        | `pnpm telegram:webhook:info:prod`, `pnpm worker:tail:prod`, then set the webhook again                                                   |
| Pending update count grows, errors are 400                                        | Update type the Worker rejected                                                                                            | Updates without `message`, `callback_query` or `my_chat_member` return `200 {ignored:true}`. Check `allowed_updates` in the webhook info |
| Old inline button shows "This button is outdated"                                 | Button from the legacy bot in chat history                                                                                 | Expected: the bot answers with a toast and the home menu                                                                                 |
| Photos missing in preview after a data copy or import                             | File ids are bound to the bot that received them                                                                           | Expected. The bot falls back to text and logs `wish_media_failed`. Test with fresh uploads                                               |
| Album: no success message after sending photos                                    | The isolate was evicted during the 1.5 second debounce                                                                     | Send any text; the bot shows the edit menu. Photos are already saved                                                                     |
| A user stops getting announcements                                                | The user blocked the bot (`blocked_at` set)                                                                                | Expected. The flag clears on their next update                                                                                           |
| Broadcast shows many `failed` or `skipped` rows                                   | Telegram errors or an ambiguous delivery                                                                                   | `pnpm exec wrangler queues pause-delivery wishlist-release-announcements`, inspect `release_announcements` and logs                      |
| No `bot_state_snapshot` events for over an hour                                   | The `*/10` cron is not firing, or the New Relic drain fails                                                                | Check Cron Events in the dashboard and `new_relic_drain_failed`. The deploy-time broadcast does not depend on the cron                   |
| `Row counts differ after copy`                                                    | Production changed during `db:copy:production-to-preview`                                                                  | Rerun the command                                                                                                                        |
| Import says the target is not empty (preview)                                     | Preview traffic left rows in `sessions` or `telegram_updates`, or an earlier import                                        | Rerun with `--reset-preview` (preview only; it deletes all application rows)                                                             |
| Import refuses `--input-dir` for production                                       | Safety guard                                                                                                               | Add `--allow-local-production-source`, and do not combine it with `MONGO_BACKUP_REF`                                                     |
| Share link answers 404                                                            | The id is malformed, the share was never created, or the owner blocked the bot                                             | Check the id (26 characters, no `i`, `l`, `o`, `u`), then `SELECT revoked_at FROM wishlist_shares WHERE public_id = '...'`               |
| Share link answers 410                                                            | The owner pressed Stop sharing                                                                                             | Expected. Sharing again restores the same link                                                                                           |
| Share page looks stale                                                            | Cache entry from the previous content or deploy                                                                            | The key changes with every content change and deploy, so wait for the browser to revalidate (`ETag`). Check `Server-Timing: share-cache` |
| `Server-Timing: share-cache;desc=miss` on every view of a `*.workers.dev` preview | The Cache API does nothing on `workers.dev`                                                                                | Expected. Test caching only on `https://wishlist.chernenko.dev`                                                                          |
| Share page has `noindex` in production                                            | The request host is not `wishlist.chernenko.dev`, the list has no visible wishes, or `BOT_ENVIRONMENT` is not `production` | Expected for previews, empty lists and error pages                                                                                       |
| Share page returns 500 and the bot says sharing failed                            | The `wishlist_shares` migration is missing in that D1                                                                      | Apply migrations (`pnpm db:migrate:prod`) before the deploy that needs them                                                              |
| D1 write fails with too many parameters                                           | More than 100 bound parameters in one statement                                                                            | Chunk rows to `floor(100 / columnCount)` or fewer                                                                                        |

## 15. Lessons from princess that apply

Princess runs on the same stack and went through the same migration. These points carry over:

- **Connect builds before relying on them, and in the right order.** Do not change the Workers Builds build command until the script it calls is on the branch that is built. The Previews command is shared by every branch.
- **Preview must not equal production.** Separate D1 databases, separate queue, separate bot, separate token. The migration tooling checks that the ids differ and match `wrangler.jsonc`.
- **Webhook setup is a deliberate step.** Builds never touch Telegram webhooks. `set` and `delete` need an explicit `--drop-pending-updates=true|false`, and the cutover uses `max_connections=1` first.
- **Widen the accepted updates before queued ones hit the Worker.** In the princess cutover, leftover non-message updates from the polling era returned 400 and stalled the queue; the fix was to answer `200 {ignored:true}` for unsupported update types. Wishlist's webhook already ignores unsupported updates, and the first `setWebhook` keeps pending updates (`--drop-pending-updates=false`) so users lose nothing.
- **Hold the broadcast, then release it.** Pause queue delivery before the go-live merge, check the row counts, then resume. Watch statuses and pause again on a burst of failures.
- **Delivery is at-most-once on ambiguity.** A missed announcement is better than a duplicate one. Do not "fix" skipped rows by resending.
- **Do not trust cron alone.** Princess saw schedules registered but not invoked. The deploy step triggers the broadcast directly, and the state snapshot acts as a heartbeat widget.
- **D1 quirks.** `7403` on the first call, no more than 100 bound parameters per statement, and exports make the database briefly unavailable. Chunk writes and rerun transient failures.
- **Record a Time Travel bookmark before any bulk write**, and keep Mongo Atlas untouched as a backup and re-import source.
- **Secrets stay out of output.** Feed values from files with `printf %s`, pipe them, and never echo them. Keep `.dev.vars*` and `env/*` out of git.
- **Branch push access is production access** because builds run branch code with the D1 token. Keep it limited.
- **Do not edit generated files by hand** (`releases.generated.json`, `worker-configuration.d.ts`, `drizzle/`, `public/app/*`, `public/styles/share.css`). CI regenerates them and fails on drift.
- **Never make go-live depend on a cron.** In princess, schedules showed as registered while no `scheduled` events appeared for about an hour, partly because every redeploy re-registers the schedule with a delay of up to 15 minutes. Verify crons in the dashboard Cron Events, not in Observability queries.
- **Remote D1 enforces foreign keys across batches; local D1 hides violations.** Import and copy parent tables first (`users`, then `wishes`, then `gives`) and run the reconciliation against the remote database.
- **`pnpm worker:preview --name preview`, with no `--`.** pnpm forwards the `--` and wrangler drops the name. `wrangler preview delete` after a merge can answer "Preview not found" because Cloudflare already removed it.
- **`telegram:webhook:info:preview` needs `--url`.** Pass the preview origin explicitly.
- **Run pnpm only in the main checkout.** `pnpm install`, `changeset version` and `cf migrate` inside a nested git worktree resolve the parent workspace and can modify the main checkout's `node_modules` or release files.
- **GitHub Releases are tagged on `GITHUB_SHA`.** Tagging an older `--target` sha failed with HTTP 403 in princess.
- **`cf` quirks.** List flags are arrays (repeat the flag, do not pass JSON), `cf builds workers create` requires a Previews base config even when previews are off, `cf workers secrets update <NAME> --worker <worker>` takes the secret name positionally, and `wrangler queues delete` takes `-y` while `cf queues delete` takes `--force`.
- **Wrangler stays the deploy tool.** The `cf` CLI is used for resources and Workers Builds configuration; `wrangler.jsonc` and Wrangler remain the source of truth for the Worker, because `wrangler tail`, `wrangler preview base-config secret put` and `wrangler queues pause-delivery` have no `cf` equivalent.

## 16. Follow-ups

Security and robustness items found by the pre-cutover audit and review that were deliberately deferred. None blocks the cutover. The same list is mirrored in [MIGRATION_STATUS.md](../MIGRATION_STATUS.md).

- **M1. Separate admin secret.** `/admin/release-broadcast` is protected by the same secret as the Telegram webhook, as in princess. Give it its own secret.
- **M3. Per-user rate limiting.** Done for the Mini App API (per-user Cloudflare rate-limit bindings, section 17). The bot webhook still has no per-user limit: nothing limits how fast one user can drive the bot, the D1 queries and the Telegram calls behind it.
- **Drop `users.telegraph_access_token` in 2.1.** The column is unused and `NULL` (the importer no longer writes tokens). Remove it from the Drizzle schema, the importer mapping, the reconcile metric and the fixtures; deploy the code first, then generate and apply the migration.
- **Drop `wishes.priority` and `wishes_owner_list_index` in 2.1.** The boolean `priority` is kept only so that code from before the priority levels keeps working during the rollout; every write sets it together with `priority_level` (true only for high). Remove it from the Drizzle schema, the repositories and the importers, deploy that code, then generate and apply the migration that drops the column and the index `wishes_owner_list_index`; `wishes_owner_priority_level_index` replaces it. This is the same two-step order as the telegraph token.
- **Share page images.** Done: share pages show photos through the image proxy with an R2 durable cache (sections 12 and 17).
- **R2 orphan cleanup.** Done for removals: removing a photo, clearing photos, removing a wish or cleaning the list deletes the R2 object of each removed `file_id` in `waitUntil`, unless another active wish still references it. Objects orphaned by older code or by a failed delete stay; a periodic job that deletes objects whose key matches no stored `file_id` is still a follow-up.
- **Webhook rate limiting.** The Mini App API is limited per user; the Telegram webhook is not.
- **S2 and S3 device verification.** `requestContact` (the phone visibility flow) and the photo file input must be confirmed on real devices (iOS, Android, Telegram Desktop, macOS, web K and A) on `@InevixTestBot` before and after the production rollout.
- **Batch 2 device verification.** On `@InevixTestBot`: `tel:` links and Copy in the contact envelope inside Telegram on iOS and Android, photo drag and drop (long-press, the system image menu on iOS, Telegram's back swipe near the left edge), the gifted bottom sheet and the Telegram back button, the grey OFF toggles in the dark theme, the 320 px layouts (currency switcher with three pills, four-segment priority control, confirmation panel) and the JS textarea fallback in the iPhone WebView.
- **Per-list OG images.** The link preview uses one static image.
- **Rate limiting the public routes.** `/w/*` is unauthenticated; cache hits are cheap, but nothing limits misses.
- **L1. Low-severity audit finding.** Deferred; details are in the pre-cutover security audit report, which is not stored in the repository.
- **L2. Bot token in URLs.** Telegraf calls `https://api.telegram.org/bot<token>/...`, and the image proxy calls `getFile` and downloads `https://api.telegram.org/file/bot<token>/...`. Resolved by disabling Workers traces (spike S5); Workers Logs and evlog events never record outgoing URLs. Do not re-enable traces without scrubbing the token from URLs.
- **L4 to L9. Low-severity audit findings.** Deferred; details are in the same audit report.

## 17. Telegram Mini App

The Mini App is a second view of the same data as the chat bot, with full parity: wishes with photos, give list, search and other users' lists, share settings, payments, visibility, language, feedback, stats, donate, releases and about. It ships in 2.0.0. The plan with all decisions and work packages is [docs/plans/mini-app.md](./plans/mini-app.md). Production stays dark until rollout step R4: `MINI_APP_ENABLED` is `"false"` in `env.production.vars` and `"true"` in local and previews.

### Architecture

- `GET /app` serves a Hono JSX shell (`src/web/app-shell`). The client is written in `hono/jsx/dom` (`src/app`) and bundled by esbuild into `public/app/app.js`, with `public/app/app.css` built by Tailwind CSS 4 and daisyUI 5. Both files are generated and committed. Never edit them by hand and never add an `index.html` under `public/app`.
- The client calls a JSON API under `/api/app/*` (`src/api`, 44 endpoints). `src/shared/app-api.ts` is the contract imported by both sides; `src/shared/app-links.ts` holds the `startapp` grammar.
- Business rules live only in `src/bot/services` and `src/bot/input`. The API and the bot call the same services over the same D1 tables, so a change made in one place shows up in the other.
- The first Mini App release needed no migrations. Batch 2 added columns (section 1, section 6 and the rollout runbook below). The only stored-shape change in `sessions.state` is an optional `via: 'app'` and `createdAt` (epoch milliseconds) on the `contact` pending input; the previous decoder rebuilds the object and drops it, so a Worker rollback is safe.
- Size budgets (all measured compressed as well as raw, and enforced by tests or the build): the app bundle `public/app/app.js` 200 KB minified and 70 KB gzip (`app:build` fails over either; raised from 160 KB and 55 KB for the link-import flow); the app stylesheet `public/app/app.css` 120 KB raw and 20 KB gzip (`test/app-styles.test.ts`); the share page HTML for 20 maximum-size wishes 100 KB raw and 20 KB gzip (`test/web-render.test.tsx`). Do not raise a budget without a reason.
- Build and checks: `pnpm run app:build` (esbuild, fails over the bundle budget), `pnpm run css:build` (share and app stylesheets), `pnpm run app:check` and `pnpm run css:check` (rebuild, then `git diff --exit-code`), `pnpm run app:smoke --base http://localhost:8787 --out <dir>` (headless Chrome screenshots of every `startapp` screen in light and dark; not run in CI). `pnpm run app:smoke --check-alignment --shots <dir>` (add `--base` as above) additionally measures where the icon, radio or checkbox of every row sits against the optical centre of its title, at 360 and 390 px, in both themes and all three languages, and fails on a failing item; it is slow (about 8 minutes, because the local Worker rate-limits to 120 requests a minute and the script pauses and retries) and is a local check, not part of `pnpm run check`. CI rebuilds both bundles and fails on drift in `public/app` and `public/styles/share.css`.
- `.gitignore` is an allowlist; new source directories must be allowed there or they are never committed.

### Routes, CSP and caching

| Route                         | Served by                      | CSP                                                                                                                                                                                                                            | Cache                                                                                                                        |
| ----------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /app`                    | Worker (`src/web/app-shell`)   | `default-src 'none'; script-src 'self' https://telegram.org; connect-src 'self'; img-src 'self' blob: data:; style-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors https://web.telegram.org` | `no-cache` with an `ETag` over the deploy id and `MINI_APP_ENABLED`; `X-Robots-Tag: noindex`; `Referrer-Policy: no-referrer` |
| `GET /app/`                   | Worker                         | share CSP                                                                                                                                                                                                                      | `301` to `/app`, query kept                                                                                                  |
| `/app/app.js`, `/app/app.css` | `assets` binding               | n/a                                                                                                                                                                                                                            | `public/_headers`: `public, max-age=31536000, immutable`; the shell links them with `?v=<deploy id>`                         |
| `/api/app/*`                  | Worker (`src/api`)             | `default-src 'none'; frame-ancestors 'none'`                                                                                                                                                                                   | `no-store`, `X-Content-Type-Options: nosniff`, JSON only, no CORS                                                            |
| `/img/w/*`                    | Worker (`src/web/image-proxy`) | `default-src 'none'; sandbox`                                                                                                                                                                                                  | `private, max-age=3600, immutable`; `Cross-Origin-Resource-Policy: same-origin`                                              |
| `/img/s/*`                    | Worker (`src/web/image-proxy`) | `default-src 'none'; sandbox`                                                                                                                                                                                                  | `public, max-age=3600`                                                                                                       |

- The shell has no inline script and no inline style. Its configuration (`data-bot-url`, `data-env`, `data-version`) sits in `data-*` attributes on `#root`.
- `style-src 'self'` stays strict. The Telegram SDK sets `--tg-*` variables through CSSOM, which the CSP allows. Its `set_custom_style` message on web.telegram.org writes a `<style>` tag and is blocked; that is accepted because the app never uses Telegram theme colors (spike S4). Fallback if a client breaks: add `'unsafe-inline'` to `style-src` for `/app` only.
- `robots.txt` disallows `/app`, `/api/` and `/img/`.
- Photos in the app need `img-src 'self'`, which already covers `/img/w/*`. External links are opened through `WebApp.openLink`, so the app stays on one origin.

### Authentication and the initData window

Every API call sends `Authorization: tma <initData>`. The middleware (`src/api/auth/middleware.ts`) runs in this order:

1. `MINI_APP_ENABLED` must be `"true"`, else `503 {error:{code:'disabled'}}`.
2. If an `Origin` header is present it must equal the request origin, else `403 forbidden`.
3. The raw initData is at most 8 KB and is validated with HMAC (secret key `HMAC("WebAppData", BOT_TOKEN)`), compared in constant time. Every field except `hash`, including `signature`, goes into the check string.
4. `auth_date` older than 24 hours is `401 stale`; more than 5 minutes in the future is `401 future`. Other 401 reasons: `missing`, `malformed`, `badHash`. A user with `is_bot` true is `malformed`.
5. Preview gate (below).
6. The rate limiter for the route bucket (below): `429 rateLimited` with `Retry-After: 60`.
7. One `users` lookup by Telegram id. Registered-only routes answer `403 registrationRequired` for guests; the registered-only set matches the bot's.

`bootstrap` is the only call that syncs the profile (`users.syncProfile`, which also clears `blocked_at`, as the webhook does). Error responses carry only a code (`{error:{code, fields?, retryAfter?}}`), never a message; the client localizes the code. Wishes that are not owned or not visible answer `404`, so there is no existence oracle. A session older than 24 hours shows the "session expired" screen; closing and reopening the app issues fresh initData.

The signing keys need no new secret. They are derived with HMAC-SHA256 from `BOT_TOKEN` with the labels `wishlist:owner-token:v1:<env>` and `wishlist:image-url:v1:<env>`. Rotating the bot token therefore invalidates every initData, owner token and signed image URL at once.

### Preview gate

Only `BOT_ENVIRONMENT` `production` is unrestricted. In any other environment (`preview`, `local`, or a missing or unknown value) a validated user other than `ADMIN_ID` gets `403 previewAccessDenied` before any D1 read or write, the same rule as the webhook (section 5). To test with a second account, change `ADMIN_ID` for the preview temporarily and restore it afterwards.

### Rate limits

Cloudflare rate-limit bindings in every wrangler environment block (bindings are not inherited):

| Binding                 | Limit per 60 s | Key                           | Used for                                                                                                                         |
| ----------------------- | -------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `APP_API_LIMITER`       | 120            | `tg:<telegramId>`             | ordinary API calls                                                                                                               |
| `APP_SENSITIVE_LIMITER` | 10             | `tg:<telegramId>`             | search (app and bot), shared-list lookup, share publish and rotate, visibility, disclosure toggles, clean, feedback, chat intent |
| `APP_UPLOAD_LIMITER`    | 20             | `tg:<telegramId>`             | photo uploads                                                                                                                    |
| `IMAGE_PROXY_LIMITER`   | 300            | SHA-256 of `cf-connecting-ip` | image proxy, checked before authorization and the cache; a missing `cf-connecting-ip` is `429`                                   |
| `APP_IMPORT_LIMITER`    | 10             | `tg:<telegramId>`             | link import from the app (and from the bot, checked by the bot before the import runs)                                           |
| `LINK_HOST_LIMITER`     | 30             | `host:<registrable domain>`   | requests to one shop, shared by all users: each page fetch, and each image staging run once per distinct image domain            |

Namespace ids are `2101` to `2106` in production, `2111` to `2116` in previews and `2121` to `2126` locally. The limits are per Cloudflare location, not global. If a binding is missing (whether `wrangler preview` honors `ratelimits` under `previews` is unverified), the request is allowed and `app_rate_limiter_missing` is emitted. The bot webhook itself is not rate limited (section 16).

### Owner tokens (other people's lists)

Access to another user's list is bound by an opaque owner token, `base36(ownerId).base36(exp).b64url(HMAC("o1|ownerId|viewerUserId|exp"))`, valid for 12 hours and tied to the viewer.

- Only a successful search mints a token. A share deep link (`startapp=s_<publicId>`) mints one only when the owner is findable; otherwise the list is read-only (no give buttons), which keeps it consistent with the bot.
- A wrong viewer gets `403 tokenInvalid`, an expired token `410 tokenExpired`.
- `DELETE /api/app/gives/:wishId` is idempotent: it answers `204` whether or not the give existed.
- Give requires a valid token, a visible wish owned by the token's owner, a findable owner and a caller who is not the owner.
- Difference from the bot: the app never writes `session.find`, so a token allows gives for every owner the user searched in the last 12 hours, not only the latest search.
- Third-party prices use each wish's own currency and are converted to the viewer's display currency (section 18); payments use the owner's `show_payments`. The old bot behaviour of showing owner prices in the viewer's currency is gone. This is an intentional fix.
- Contact details (phone and delivery address) are in the third-party list response only when `resolveOwnerContact` allows it (section 12, Contact details in Telegram): registered, non-blocked, non-owner viewer, first page only. They stay in memory on the client: they are never written to `sessionStorage`, `localStorage` or Telegram CloudStorage, which `test/app-contact-storage.test.ts` enforces.
- **Tokens in logs.** Workers request logs contain the path segments `/api/app/lists/<token>` and `/api/app/shared/<publicId>`; `redact_query_string` covers only the query string, not the path. This is accepted: owner tokens are viewer-bound and valid for 12 hours, and a share `publicId` is already public by design.

### Client requirements

The Mini App needs iOS 16.4 or newer for its styling: CSS `@layer` and `:has()` (15.4), container queries (16.0), `color-mix()` (16.2) and the `lh` unit (16.4, used for the textarea height cap) together set the floor at 16.4. Older WebViews render it unstyled or broken. `field-sizing: content` is not supported by the iPhone WebView, so textareas grow through a small script fallback (`src/app/logic/autosize.ts`) that caps them at 12 rows. The chat bot works on every client, so it remains the fallback.

### Navigation and bottom buttons

The app keeps its own navigation stack and drives Telegram's native buttons from it.

| Control                  | Minimum client                                                                            | Behaviour                                                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BackButton               | Bot API 6.1                                                                               | Shown on every screen deeper than the root; pops one entry, or closes an open bottom sheet first. Hidden at the root and when the app hands over to a system screen (session expired, boot error).               |
| MainButton               | Any supported client (6.9) on a native platform                                           | Text only, one per screen. Unchanged.                                                                                                                                                                            |
| SecondaryButton ("Home") | Bot API 7.10 on a native platform (`ios`, `android`, `tdesktop`, `macos`, `weba`, `webk`) | "На головну", "Home" or "Strona główna", `position: 'left'` next to the MainButton, Telegram's default colours. Shown on every screen deeper than the root and hidden at the root. Resets the stack to the root. |
| In-page fallbacks        | Older clients and `platform === 'unknown'` (also the headless smoke)                      | A back link above the title, the bottom bar for the MainButton, and a small "На головну" text link at the end of the screen content instead of the SecondaryButton.                                              |
| Safe-area insets         | Bot API 8.0                                                                               | The sticky list header and the toasts read `--tg-safe-area-inset-*` and `--tg-content-safe-area-inset-*`; older clients fall back to `env(safe-area-inset-*)`.                                                   |

- **Home and Back share the discard guard.** An editor with unsaved changes asks before Back, before Home, and before any link that returns to a screen further down the stack. A popup answered after the stack already changed (an upload finished, onboarding reset it) does nothing.
- **Links between screens never stack copies.** Share and Delivery link to each other, and Find is reachable from other people's lists and from Gifts to give; when the target is already in the stack the app goes back to it instead of pushing it again. "Search again" on a broken or expired list replaces the list with Find.
- **Link import.** The prefilled editor is its own entry above the link step: Back returns to the link step with the link still filled in, and saving drops the link step so Back goes to My wishes. The import answer (with its short-lived import token) stays in memory only, so Telegram's "Reload page" reopens the editor with the link alone.
- **Reload.** The stack is mirrored to `sessionStorage` under `wl.nav.v2` (bumped from `wl.nav.v1` when the editor route gained the import link; older snapshots are ignored). Scroll positions, drafts and dirty flags are not restored.
- **Sticky list header.** On My wishes and on other people's lists the title, the actions (Share and "•••" on My wishes) and the filter chips stick to the top below `--safe-top`. Once scrolled, the header collapses to one compact row plus 32 px chips, at most 92 px at 390 px width, with a 1 px ink hairline; the count line (the owner card on other people's lists) is hidden. A reserve below the header keeps the content in place, and the 150 ms collapse is skipped with reduced motion. `pnpm run app:smoke --check-alignment` also measures the stuck header height, the icon alignment and card overflow at 360 and 390 px in all three languages.
- **Toasts** sit 1rem above the bottom safe area; they move up by 5rem only while the in-page bottom bar is mounted.
- **Device checks still open:** the SecondaryButton on a screen without a MainButton (the Telegram docs do not define that layout), the stuck header in fullsize and fullscreen modes, and the toast distance above the native button bar on iOS, Android and Desktop.

### Photos

- **Upload** (`POST /api/app/wishes/:id/images`, raw `image/jpeg|png|webp` body up to 5 MiB, with the magic bytes checked against the declared type). The client resizes first (longest edge 1600 px, JPEG quality 0.85). The Worker checks ownership and that fewer than 9 images exist, then `sendPhoto` to the user's own private chat with `disable_notification: true` (raw `fetch` and `FormData`), keeps the largest `file_id` through the existing atomic and deduplicating `appendImage`, and calls `deleteMessage` (best effort, through `waitUntil`). `wishes.images` therefore stays a JSON array of `file_id` strings and the bot's album rendering is unchanged. A Telegram 403 maps to `409 writeAccessRequired`; the user is not soft-blocked.
- **Spike S1 passed** on 2026-10-02 (preview bot): after `deleteMessage` the `file_id` still works for `getFile` and for re-sending, so no carrier message stays in the chat.
- **Image proxy** (one handler, two URL shapes). App: `/img/w/<wishId>/<index>/<hash>?e=<exp>&s=<sig>`, HMAC-signed, the expiry rounded up to the next hour plus one hour so the URL is stable within the hour and browsers cache it. Share pages: `/img/s/<publicId>/<wishId>/<index>/<hash>`, no expiry, and a live D1 check on every request (share active, owner not blocked, wish visible and owned by the share owner). `<hash>` is the first 16 hex characters of SHA-256(`file_id`).
- **Cache layers.** The Cache API sits in front for hot paths (7 days, per data center; it does nothing on `*.workers.dev`). The durable layer is R2, binding `IMAGES`: bucket `wishlist-images` in production and `wishlist-images-preview` in previews and local. The object key is the full SHA-256 of the `file_id` and the `content-type` is kept as metadata. On a miss the Worker calls `getFile`, downloads Telegram's re-encoded file, writes R2 and the Cache API, and responds; uploaded bytes are never written to R2 directly. Telegram stays the source of truth: an R2 failure degrades to a miss.
- **Never exposed.** The upstream `api.telegram.org/file/bot...` URL is never logged or returned, and the proxy never echoes the token. Removing a photo or a wish deletes its R2 object in `waitUntil` unless another active wish references the same `file_id`; the check uses `json_each` over `wishes.images`. The signed `/img/w` URLs stay valid for about 1 to 2 hours after a wish is hidden: the owner must still see their hidden photos, so `/img/w` checks only the signature and that the wish is not removed, not its `hidden` flag. This is an accepted trade-off; `/img/s` always checks visibility. A user can have at most 500 active wishes (`409 wishLimit`; the bot replies with `wishlist.add.limit`).
- **Bucket creation.** Create both buckets before deploying a Worker that binds them: `pnpm exec wrangler r2 bucket create wishlist-images` and `pnpm exec wrangler r2 bucket create wishlist-images-preview` (skip a bucket that already exists).
- **Chat fallback.** `POST /api/app/wishes/:id/images/chat-intent` sets the pending `wishField images` input and sends the bot's usual prompt, for devices where the file input fails (spike S3).

### Session rules

The app and the bot are two views over the same D1 rows.

1. The app never writes `session.find`.
2. The app writes `pendingInput` in three cases only: the phone contact intent (`{kind:'contact', authType, via:'app'}`), the photo chat intent (`wishField` images), and clearing a pending contact intent. It never clears unrelated pending input, so a half-written feedback message in the chat survives. The contact intent expires after 10 minutes (a missing `createdAt` counts as expired), and while it is pending any message that is not a contact, as well as any command or button, clears it and is handled normally; only an actual contact message completes it.
3. Removing a wish or cleaning the list calls `sessions.clearWishReferences` (best effort, failures only log): it clears `pendingInput` only if it is a `wishField` for a removed wish, and `album` only if `album.wishId` matches.
4. App uploads are single `sendPhoto` calls, so album state and `sessions.media_group_*` are never touched.
5. Language and registration go to the same columns the bot reads (`users.language` for users, `sessions.language` for guests).
6. Chat history is not edited when the app changes data; every bot button re-reads D1.
7. A contact intent with `via: 'app'` completes quietly: the bot sends only the success text without the home menu, and the app polls `GET /api/app/me` once a second for up to 15 seconds.

### Entry points

- The Main Mini App (profile button and `https://t.me/wishlist_ua_bot?startapp`).
- Inline `web_app` buttons built from the request origin (`https://<origin>/app?start=<param>`), so a branch preview opens its own app. They sit on the home keyboards, the wishlist menu (`start=wishes`), the wish edit menu (`start=w_<id>`) and the share link screen (`start=share`), and are hidden when `MINI_APP_ENABLED` is not `"true"`.
- The `/app` command, which replies with a `web_app` button. After changing the command list run `pnpm telegram:commands:set:prod` (or `:preview`).
- Share pages carry a secondary "Open in Telegram" link to `https://t.me/wishlist_ua_bot?startapp=s_<publicId>`. In previews it points to the production bot, which shows "not found"; this is accepted.
- `startapp` grammar (at most 64 characters, `[A-Za-z0-9_-]`): `wishes`, `add`, `w_<id>`, `gives`, `find`, `s_<publicId>`, `share`, `settings`, `visibility`, `payments`, `language`, `feedback`, `stats`, `donate`, `releases`, `about`. It is only a routing hint; the API authorizes every call.
- Production keeps the default command menu. Replacing it would hide `/start`, `/lang`, `/releases` and `/app`.
- Preview: `pnpm preview:point` also sets the menu button of the admin chat (`ADMIN_ID`) to `{type:'web_app', text:'App', web_app:{url:<branch origin>/app}}`, and `pnpm preview:reset` restores `{type:'default'}`. Both keep the `getMe` guard that only allows `@InevixTestBot`.

### BotFather

Preview `@InevixTestBot` (one time):

1. `/mybots`, pick the bot, Bot Settings, Configure Mini App, Enable Mini App. URL: `https://preview-wishlist.chernenko.workers.dev/app`.
2. Configure the splash screen: icon from `public/apple-touch-icon.png`, light background `#F1E3FB`, dark background `#1A1220`.
3. Do not set a Menu Button; `pnpm preview:point` sets the admin's per chat.

Production `@wishlist_ua_bot` (rollout step R5): the same steps with `https://wishlist.chernenko.dev/app`, the same splash, and media previews in uk, en and pl taken from `pnpm app:smoke` screenshots. No `/setdomain` and no `/newapp`; leave the Menu Button at its default.

Bot API origin protection: the whole app stays on one origin. Whether inline `web_app` buttons that point at a branch preview origin (different from the configured Main App domain) keep working is unverified; if they do not, test branches through the long-lived preview (`pnpm worker:preview --name preview`).

### Testing on a preview

1. Push the branch, then `pnpm preview:point` and `pnpm telegram:commands:set:preview`.
2. In a private chat with `@InevixTestBot`, open the app from the menu button, from `/app` or from an inline button.
3. For a quick look without a device, run `pnpm run dev` and `pnpm app:smoke`; it signs initData for `ADMIN_ID` from `.dev.vars` without printing it.
4. Spikes that need a real device: S2 (`requestContact` posts the contact message to the chat and the `via: 'app'` path completes, on iOS, Android and Desktop) and S3 (the file input on iOS, Android, macOS, Windows, Linux, web K and A).

### Rollout runbook

Six additive D1 migrations are pending: `20261003214556_many_harry_osborn` (channel last-seen columns), `20261004011719_careless_mulholland_black` (`exchange_rates`, section 18), `20261004083515_far_impossible_man` (per-wish `currency`, `priority_level`, the delivery address and disclosure flags, `allow_indexing`, the new priority index and two backfills), `20261004090459_flat_omega_sentinel` (`show_gifted`, `gifted_hidden`), `20261004111004_show_gifted_default_on` (`UPDATE users SET show_gifted = 1`) and `20261004162852_list_imports` (`wishes.source_ref`, `wishes.source_image_url` and the `list_imports` table, section 20). Production already runs this branch, so the order follows the share-page precedent: all six are applied by hand with `pnpm db:migrate:prod` before the R4 deploy, an explicit exception to the "no manual production migration before a merge" rule, approved for this release. The data steps (bookmark, counts, verification, repair) are in "R4 in detail" below.

1. **R0.** All work merged on `feat/migration-to-v2`, `pnpm run check` green, the CI drift check covers `public/app`, security audit fixes in.
2. **R1.** Push. Workers Builds builds the preview and `db:migrate:ci` reports nothing pending. Run `pnpm preview:point` and `pnpm telegram:commands:set:preview`.
3. **R2.** One-time BotFather setup for `@InevixTestBot`.
4. **R3.** Run spikes S1 to S5 and walk the parity checklist, cross-checking each feature in the chat: create in the app and see it in the bot; edit in the bot and see it in the app after Retry or the `activated` event; remove a wish in the app while the chat has a pending `wishField` for it; give in the app and see it in the bot's give list; stop sharing and see `410` on the page; upload 3 photos and see them in the bot album and on the share page; language Auto, feedback to the admin, stats, donate, what's new, a `s_<id>` deep link and an old chat button. Device matrix: iOS, Android, Telegram Desktop on Windows and Linux, Telegram macOS, web K and A. S5 is resolved by disabling Workers traces; it only needs a check that Workers Logs contain no `Authorization` header and no `api.telegram.org/bot...` or `/file/bot...` URL.
5. **R4.** Take the Time Travel bookmark and record the priority count (R4 in detail, steps 1 and 2). Run `pnpm db:migrate:prod`, confirm all six pending migrations are applied and run the verification queries (steps 3 and 4). Check that both R2 buckets exist, set `MINI_APP_ENABLED` and `WISHLIST_IMPORT_ENABLED` to `"true"` in the production vars, then `pnpm worker:deploy:prod` from the branch. Verify: `curl -sI https://wishlist.chernenko.dev/app` returns 200 with the exact CSP; `/api/app/bootstrap` without auth returns 401; `/app/app.js` is immutable; a share page with photos serves `/img/s/...` with 200 and the second view is a cache hit. Then repair the priority writes of the deploy window (step 6) and `pnpm telegram:commands:set:prod` to add `/app`.
6. **R5.** BotFather production setup.
7. **R6.** Admin smoke from the profile "Open app", from `/app` and from the home inline button: create a wish with 2 photos and check it in the chat and on the share page; search a known user, give and take; switch language to Auto; send feedback.
8. **R7.** Watch the `Mini App` dashboard page for 60 minutes: 5xx, auth rejections, rate limits, upload results, proxy errors.
9. **R8.** Finish 2.0.0 as in [MIGRATION_STATUS.md](../MIGRATION_STATUS.md) ("To finish after the announcement text is approved"). The paused broadcast picks up the new changelog bullets from the manifest.

### R4 in detail: batch 2 data steps

1. **Bookmark.** Before any write, record the D1 Time Travel bookmark, as in step E5.4 of the cutover: `pnpm exec wrangler d1 time-travel info wishlist-production --env production`. Note it in MIGRATION_STATUS.md.
2. **Record the priority count.** `pnpm db:query:prod --command "SELECT count(*) FROM wishes WHERE priority = 1"`. Write the number down; step 4 compares against it.
3. **Apply the migrations by hand.** `pnpm db:migrate:prod`, before the deploy (the approved exception). The statements are `ADD COLUMN`s, `CREATE INDEX`es, one `CREATE TABLE` (`list_imports`) and three backfills (`priority_level = 3` where `priority = 1`; each wish takes its owner's currency, `UAH` for orphans; `show_gifted = 1` for every user), with no table rebuild. Until the new code is deployed, the old code keeps running on the new schema: it ignores `currency`, and it writes only the legacy `priority`, so `priority_level` falls behind (repaired in step 6).
4. **Verify.**
    - `SELECT count(*) FROM wishes WHERE priority_level = 3` equals the number from step 2.
    - `SELECT currency, count(*) FROM wishes GROUP BY currency` shows only `UAH`.
    - `SELECT show_payments, count(*) FROM users GROUP BY 1` shows only `1` (payments stay visible as before).
    - `SELECT show_phone, show_address, show_gifted, count(*) FROM users GROUP BY 1, 2, 3` shows only `0, 0, 1`, and `SELECT allow_indexing, count(*) FROM wishlist_shares GROUP BY 1` shows only `1`.
5. **Deploy** as in R4 above.
6. **Repair the deploy window.** Right after the deploy, run both statements (each with `pnpm db:query:prod --command "..."`). They are idempotent and safe, because the new code writes `priority` and `priority_level` together:

    ```sql
    UPDATE wishes SET priority_level = 3 WHERE priority = 1 AND priority_level <> 3;
    UPDATE wishes SET priority_level = 0 WHERE priority = 0 AND priority_level = 3;
    ```

7. **Rates.** Open any share page. The first read in a fresh isolate schedules a refresh; confirm an `exchange_rates_refresh` event with `outcome` `refreshed` and that `SELECT currency FROM exchange_rates` now lists `USD`, `EUR` and `PLN`. The per-currency fallback (section 18) serves the baked-in USD rate until then, so pages are never wrong or broken.
8. **Preview first.** `db:migrate:ci` applies the migrations to `wishlist-preview` on push. On `@InevixTestBot` walk the parity checklist for currency (bot, app and web switcher), priority levels, contact disclosure (including that nothing appears on the web page), photo order and gifted wishes.
9. **Rollback note.** Old code ignores the new columns, and every priority write keeps `priority` and `priority_level` consistent, so a Worker rollback is safe and no data is lost. While rolled back, wishes in other currencies than `UAH` show their numbers as hryvnias, and the disclosure, indexing and gifted settings have no effect (the old pages never showed contact details, and the old code ignores `allow_indexing`). The data stays intact and is correct again after the next deploy. Restoring Time Travel is a last resort (section 9).

### Kill switch and rollback

1. **Fastest.** BotFather, Configure Mini App, Disable. The profile button disappears.
2. **Kill switch.** Set `MINI_APP_ENABLED` to `"false"` in the production vars and redeploy. `/app` renders a "temporarily unavailable" page (language from `Accept-Language`) with a link to the bot, `/api/app/*` answers `503 {error:{code:'disabled'}}`, the bot hides its `web_app` buttons and `/app` replies with the home menu. `/img/s/*` keeps working, so share pages keep their photos.
3. **Full rollback.** `pnpm exec wrangler rollback --env production`. It is safe: the schema changes are additive and the old code ignores them (see the rollback note in R4 in detail for what is not honoured meanwhile), the old session decoder ignores `via`, and photos added in the app are ordinary `file_id`s.
4. **Data.** No cleanup is ever needed. Old `web_app` buttons in chat history open the shell, which renders the unavailable page.

### Troubleshooting

| Symptom                                                                  | Likely cause                                                                                                          | Fix                                                                                                                       |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| App shows "open this app from Telegram"                                  | Opened in a normal browser (empty initData)                                                                           | Expected. Open it from the bot                                                                                            |
| App shows "session expired"                                              | `auth_date` older than 24 hours (`401 stale`)                                                                         | Close and reopen the app. If it persists, check the device clock                                                          |
| Every API call is `401 badHash`                                          | The Worker's `BOT_TOKEN` is not the token of the bot that opened the app, for example a branch preview of another bot | Use the matching bot (preview bot for previews, production bot for production)                                            |
| App shows "preview only" (`403 previewAccessDenied`)                     | A non-admin user opened a preview or local app                                                                        | Expected. Change `ADMIN_ID` temporarily to test with another account                                                      |
| `503 disabled`, or the "temporarily unavailable" page                    | `MINI_APP_ENABLED` is not `"true"`                                                                                    | Expected in production before R4 or after the kill switch                                                                 |
| `429 rateLimited`                                                        | The per-user bucket is exhausted (limits are per location)                                                            | Wait 60 seconds. A burst in `app_rate_limited` on one bucket points at a client loop                                      |
| `app_rate_limiter_missing` events                                        | The rate-limit binding is absent or erroring (for example in a preview)                                               | Requests are allowed meanwhile. Check the `ratelimits` block of that environment and redeploy                             |
| Upload answers `409 writeAccessRequired`                                 | Telegram refused `sendPhoto` to the user's chat (the user blocked the bot)                                            | Ask the user to unblock the bot. The user is not soft-blocked by this path                                                |
| Upload answers `502 upstream`                                            | Telegram API error                                                                                                    | Retry. Check `app_photo_uploaded` with `result = telegramError`. The chat fallback ("Add photos in the chat") still works |
| Photo upload button does nothing on one client                           | File input not supported by that WebView (spike S3)                                                                   | Use the chat fallback. Record the client in the S3 notes                                                                  |
| Photo tiles are broken in the app                                        | Signed `/img/w` URL expired (stale screen), or `getFile` failed on a miss                                             | Reopen the screen. Check `image_proxy_served` with `result` `expired` or `upstreamError`                                  |
| Photos from a production copy are broken in preview                      | File ids belong to the production bot (section 5)                                                                     | Expected. Test with fresh uploads                                                                                         |
| Share page photo answers 404                                             | Share stopped, owner blocked, wish hidden or removed, or the hash does not match the stored `file_id`                 | Expected. The proxy checks D1 live on every request                                                                       |
| `image_proxy_served` shows many `miss` results                           | R2 binding or bucket missing, so every request goes to Telegram                                                       | Check that `wishlist-images` (or `-preview`) exists and `IMAGES` is bound. `image_store_failed` warnings appear in logs   |
| Phone visibility never completes                                         | The contact message did not reach the chat (spike S2), or the 15 second poll timed out                                | Retry. Check the pending state with `sessions.state`. The chat flow (section 1) still works                               |
| An old chat button opens the wrong list                                  | Bot buttons stay bound to the bot's own latest search (the app never writes `session.find`)                           | Expected. Search again in the chat                                                                                        |
| Banner "blocked by CSP" for `set_custom_style` on web K/A                | web.telegram.org injects a `<style>` tag, which `style-src 'self'` blocks                                             | Expected and harmless (spike S4). Only if the UI breaks, add `'unsafe-inline'` to `style-src` for `/app`                  |
| `pnpm run css:check` or `app:check` fails in CI                          | `public/app/*` or `public/styles/share.css` is out of date                                                            | Run `pnpm run app:build` and `pnpm run css:build`, then commit the result. Never edit those files by hand                 |
| `app:build` fails on the size budget                                     | The bundle grew past 200 KB minified or 70 KB gzip                                                                    | Remove the dependency or code that grew it. Do not raise the budget without a reason                                      |
| No "Home" button under the screen, a "Home" text link at the end instead | The client is older than Bot API 7.10 or reports no native platform                                                   | Expected. The link resets the stack to the root like the native button                                                    |

## 18. Prices and exchange rates

Every wish stores its own currency: `wishes.currency` is one of `UAH`, `USD`, `EUR` and `PLN` (`CURRENCIES` in `src/shared/money.ts`), and `price` is a plain number in that currency. The user has one currency setting, `users.currency`, which is both the default for new wishes and the currency in which that user sees every price. Display is converted for the viewer; the stored price never changes.

### Currencies per wish and the user setting

- **Default by language.** A new user gets a currency from the locale at registration: `uk` gives `UAH`, `en` gives `EUR`, `pl` gives `PLN` (`DEFAULT_CURRENCY_BY_LOCALE`). A language the guest picked in the session wins over the Telegram language code. `USD` is selectable but is nobody's default. Users imported from Mongo and every existing user stay on `UAH`, because the migration only adds the column.
- **Changing the setting.** Bot: Settings, then the currency screen (single-column buttons, ✅ on the current one). App: the Settings screen, currency. Both write `users.currency` and emit `currency_changed`. The change is a display preference; it does not rewrite any wish.
- **Per wish.** A new wish takes the owner's `users.currency`. The bot price prompt accepts a currency marker typed with the number (`₴`, `грн`, `uah`, `$`, `usd`, `€`, `eur`, `zł`, `pln` and similar, before or after the number), which also sets the wish's currency, and sends a second message with the other currencies as inline buttons (Telegram allows one reply markup per message). The app editor has a `₴ $ € zł` segmented control under the price field. The migration gave every existing wish its owner's currency (`UAH` for orphans).

### Display currency

- **Registered viewers (bot and app)** see prices in their own `users.currency` (`resolveDisplayCurrency`). The app receives it as `currency` in the `me` payload of `bootstrap`.
- **Guests (no `users` row)** see the language default.
- **Share pages** use the `currency` cookie set by the web switcher (section 12, Currency on share pages) and, without it, the language default of the page. Cookie values other than the four currencies mean "auto".
- The source currency is always the wish's own, never the owner's setting and never the viewer's. The same currency shows the exact price. Another currency shows an approximation marked with `≈`, rounded to whole units from 10 and to one decimal below (never 0, at least 0.1).
- Compact cards (app tags, share page cards) show only the converted value; the original price is in the `title` and in the screen reader text. The bot wish message shows `≈ €20 (₴1,000)`. The app editor shows a live `≈` value under the price field when the display currency differs.
- Share pages add one note under the list ("Prices are approximate, in EUR at the National Bank of Ukraine rate for 05/10/2026") when at least one price was converted.

### Price filters

- The five filters (index 0 to 4, `users.wishlist_filter` unchanged) have exact ranges per display currency: `UAH` up to 999, 1000 to 1999, 2000 to 4999, 5000 to 9999, from 10000; `USD` and `EUR` up to 19, 20 to 39, 40 to 99, 100 to 199, from 200; `PLN` up to 99, 100 to 199, 200 to 499, 500 to 999, from 1000. The single table is `PRICE_FILTER_RANGES` in `src/shared/money.ts`; the bot, the API and the repository all read it.
- The index and the viewer's display currency pick the range; the bounds are converted into each wish's own currency and applied half-open (`price >= from` and `price < to + 1`), so converted ranges leave no gaps. For hryvnia viewers of hryvnia wishes this matches the old inclusive ranges for whole prices.
- The app receives every currency's ranges in `bootstrap` (`config.priceFilters`) and picks by the current display currency, so a currency change relabels the chips immediately.

### Source and storage

- Source: the NBU open API, `GET https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json`, no key. `rate` is hryvnias per unit; `exchangedate` is `DD.MM.YYYY`.
- `exchange_rates` holds one row per converted currency (`USD`, `EUR`, `PLN`): `uah_per_unit`, `rate_date` (ISO date) and `fetched_at`. The hryvnia is the pivot (always 1) and is not stored. Existing deployments have `EUR` and `PLN` rows and gain `USD` on the first refresh after the deploy.
- A refresh fetches with a 5 second timeout and validates the payload: all three currencies present, finite positive rates, a real date. Only then are the rows upserted. A failed fetch or an invalid payload leaves the stored rates untouched.
- `FALLBACK_RATES` in `src/shared/money.ts` is a baked-in snapshot (dated 2026-10-05) with all four currencies. The fallback is per currency: a missing or unusable row falls back on its own, so a table with only `EUR` and `PLN` still serves exact stored values for those and the baked-in `USD`. Any fallback marks the snapshot as stale, which schedules a refresh. The whole snapshot is used when the table is empty, when D1 is unreachable, in tests and locally, so rendering never fails on missing rates.
- The table is not copied by `pnpm db:copy:production-to-preview`; each environment refreshes its own rates.

### Refresh

- **Production.** The daily cron (`0 0 * * *`) runs the refresh (task `rates:refresh`) before the maintenance prune.
- **Every environment, on read.** Reads go through an isolate cache with a 10 minute TTL. When the stored rates are missing or incomplete, or `fetched_at` is older than 36 hours, the read schedules one refresh with `waitUntil` and serves the stored or fallback rates meanwhile. An isolate flag and a minimum gap of one hour between attempts throttle it. Previews and local, which have no crons, refresh this way on the first request.
- **Force a refresh.** Previews and local: delete the rows (`pnpm db:query:preview --command "DELETE FROM exchange_rates"` or `pnpm db:query:local --command "DELETE FROM exchange_rates"`) and open any page; the next read in a fresh isolate refreshes. Production: wait for the cron, or delete the rows the same way with `pnpm db:query:prod` (pages serve the fallback until the background refresh lands).
- Share pages include the rates date and values in the fingerprint, so a refresh invalidates the cached HTML and the `ETag` on its own.

### Telemetry

`exchange_rates_refresh` with closed labels only: `trigger` (`cron`, `read`), `outcome` (`refreshed`, `unchanged`, `failed`) and, on failure, `reason` (`timeout`, `network`, `httpStatus`, `invalidJson`, `invalidPayload`, `missingCurrency`, `invalidRate`, `invalidDate`, `storage`, `unexpected`). A day without a `refreshed` or `unchanged` event from the cron means the rates are aging; pages keep working on the last stored rates. `currency_changed` carries the new currency in `result`, and `share_page_served` carries `displayCurrency` and `currencySource` (section 13).

## 19. Link import

A user pastes a product link in the Mini App or sends it to the bot, and the Worker fills in the title, description, price and photos. The editor (app) or the edit menu (bot) always follows, so a wrong extraction is visible and editable before anything else happens.

### Architecture

- **One pipeline for both channels.** `src/bot/services/link-import/` holds the business logic: `normalize-url.ts` (validation, tracking-parameter removal, the SHA-256 URL hash), `safe-fetch.ts` (SSRF-safe fetch), `collect.ts` (HTMLRewriter, Workers only), `extract.ts` (JSON-LD, microdata, OpenGraph), `result-cache.ts`, `stage-images.ts` and `ingest.ts`. `link-import-service.ts` wires them; `src/worker/link-import.ts` builds the services once per isolate and passes them to the API, the `/img/i` route and the bot. The services hold no per-request state; the env, the clock and `waitUntil` arrive with every call.
- **Synchronous, no Queue.** `POST /api/app/link-import` runs the import inside the request (7 s handler budget; the client gives up at 9 s and opens the editor with the link only). The bot replies "Шукаю товар…" at once and finishes the import in `waitUntil` within a 20 s budget.
- **Safe fetch.** `https:` only (a scheme-less or `http:` link is upgraded), default ports only, no IP literals, `localhost`, `*.local`, `*.internal`, single-label hosts or our own hosts. Redirects are followed by hand (at most 5 hops, each re-validated). Pages: 6 s timeout, `text/html` or `application/xhtml+xml`, at most 2 MiB read. Images: 4 s each, 8 s in total, 3 at a time. The User-Agent is the honest `WishlistBot/2.0 (+https://wishlist.chernenko.dev)`; no caller headers or cookies are forwarded.
- **No transcoding.** Images are stored exactly as downloaded. Only JPEG, PNG and WebP, recognised by their magic bytes, up to 10 MiB (Telegram's multipart photo limit) are accepted. AVIF, GIF, unknown formats, larger files and any photo Telegram refuses with a 400 (for example because of its dimensions or aspect ratio) are skipped as unsupported. The app shows "Some photos are in an unsupported format, add them manually" for such a tile (`importWishImage` answers `415 unsupportedMedia`), and the bot adds the same note under the preview.
- **App flow.** "New wish" opens the link step (`linkImport` screen), which prefills the editor from the result. The first 5 images are staged in `waitUntil` right after the response; their previews are served by `/img/i/<urlHash>/<n>?e=&s=` (HMAC-signed, private cache, no URL in the path), which re-stages an image on a miss. On save, each kept tile calls `POST /api/app/wishes/:id/images/import` with the import token (valid 2 h, bound to the user), which uploads the staged bytes to the user's chat, keeps the `file_id` and deletes the message, like an ordinary upload.
- **Bot flow.** A bare link in the add-wish prompt starts the import; a bare link outside any dialog gets the "Додати це посилання як бажання?" offer (kept 15 minutes in the session). The wish is created, the staged photos are sent as the preview (an album for 2 or more), and the preview's own `file_id`s are stored, so nothing is deleted afterwards. URL buttons that Telegram rejects fall back to no URL button, as everywhere in the bot. Without a title the bot asks for one and keeps the link. The session with the import marker is written before the deferred task starts, so the task's claim never races the end-of-update session save. If the claim still finds no marker and the stored session is older than the marker write (the marker never landed), the bot sends the "couldn't read the page" message and keeps the link for a typed title; when the user has moved on, the result is dropped silently.
- **Currencies.** A price in one of our currencies prefills the price; any other currency is shown as "Price on the site" and not stored.

### Flags and bindings

| Name                  | Where                   | Meaning                                                                                                                                                                                                                                                                               |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LINK_IMPORT_ENABLED` | vars, every block       | Kill switch. `"true"` locally and in previews, `"false"` in production until rollout. Off: the app skips the link step (`BootstrapDto.config.linkImportEnabled`), the API answers `503 disabled`, `/img/i` answers `404` and the bot treats a link as a plain title.                  |
| `LINK_IMPORT_AI`      | vars, every block       | Always `"false"`. No Browser Rendering or Workers AI fallback is built.                                                                                                                                                                                                               |
| `APP_IMPORT_LIMITER`  | ratelimits, every block | 10 imports per 60 s per user (`tg:<telegramId>`), for the app route and the bot (section 17).                                                                                                                                                                                         |
| `LINK_HOST_LIMITER`   | ratelimits, every block | 30 checks per 60 s per shop (`host:<registrable domain>`), shared by all users: one per page fetch (a refused fetch is the `rateLimited` outcome) and one per distinct image domain in each staging run, including `/img/i` re-staging (a refused domain skips its images as failed). |
| `IMAGES`              | R2, every block         | The existing image bucket also holds the import cache and the staged images under `import/`.                                                                                                                                                                                          |

### Limits

- At most 9 image candidates per product; the app pre-stages and shows the first 5, the bot ingests the first 5.
- A wish still holds at most 9 photos; an import never exceeds the free slots.
- Result cache: 24 h for `ok` and `partial`, 1 h for `blocked` and `notProduct`; timeouts, invalid links and rate-limited results are never cached, and neither is any page answered with a 5xx or a 429, so a transient shop failure is retried on the next import. A redirect loop (`tooManyRedirects`) is still cached as `notProduct`.
- Bot album: at most 20 MiB in total (`LINK_IMPORT_BOT_ALBUM_MAX_BYTES`); photos past the cap are dropped in index order and counted as skipped. Bytes downloaded by staging are reused for the upload instead of being read back from R2, and no photo is uploaded once the 20 s bot budget is spent (the wish card is sent as text with the photos-failed note). If the wish changed before the preview `file_id`s were stored, the photos count as not ingested and the same note is shown.
- Extractor bounds against hostile pages: meta `content` and item property attributes are cut to 2048 characters, at most 32 text sinks and 64 microdata scopes are open at once, text is cut to 4000 characters before tags are stripped (linear tag stripping), and at most 500 JSON-LD nodes are read, with product variants indexed by parent once. Entities resolve only own keys of the named-entity table. `limits.cpu_ms` is not set in `wrangler.jsonc`; the plan default applies.
- Prices: JSON-LD offers, `og:`/`product:` price tags and item property `content` are machine-readable, so `.` is always the decimal point (`2.500` is 2.5; `49,99` with one or two decimals is accepted, and an ambiguous `1,299.00` is dropped so the next source is tried). Visible microdata text is parsed like user input after leading currency signs or words (`€`, `from`, `від`) are stripped. The extracted price keeps its fraction; a price in one of our currencies is rounded to whole units when the wish is prefilled, and a foreign-currency "Price on the site" keeps its decimals. Offers and images given as `{"@id": …}` references resolve to the JSON-LD node with that id.

### R2 prefixes and lifecycle

- `import/<urlHash>/meta.json`: the cached result (normalised URL without tracking parameters, the extracted product, `expiresAt` metadata).
- `import/<urlHash>/<n>`: a staged image, kept 24 h.
- `<urlHash>` is the first 32 hex characters of the SHA-256 of the normalised URL; keys never contain a URL.
- The daily production cron (`0 0 * * *`) deletes expired `import/` objects and emits `link_import_cache_purged` (or `link_import_cache_purge_failed`). Previews have no crons, so add the lifecycle rule there too.
- **Ops step, once per bucket.** Add an R2 lifecycle rule that deletes objects under the prefix `import/` after 2 days on `wishlist-images` and `wishlist-images-preview` (Cloudflare dashboard, R2, the bucket, Settings, Object lifecycle rules). The wish photo cache (`<64 hex>` keys) is never touched by it, and `src/api/photos/image-cleanup.ts` never treats `import/` keys as orphans.

### Telemetry

`link_import_completed`, once per import, with closed labels only: `channel` (`app`, `bot`), `result` (`ok`, `partial`, `blocked`, `notProduct`, `timeout`, `invalidUrl`, `rateLimited`) and `outcome` (`success`, `rejected`, `error`), `source` (`jsonld`, `microdata`, `og`, `adapter`, `ai`), `shop` (one of 15 researched shops or `other`, never a host), `cacheOutcome` (`hit`, `miss`), `imagesStaged`, `imagesSkipped` and `imagesIngested` (`none`, `oneToFour`, `fivePlus`) and `elapsedBucket` (`instant`, `quick`, `normal`, `slow`, `verySlow`). In the app, `imagesIngested` is always `none`; each saved photo emits `app_photo_uploaded` instead. A missing or failing limiter emits `app_rate_limiter_missing` with `bucket` `import`. `/img/i` reports `image_proxy_served` with `scope` `import`. Callback categories: `wish:addNoLink` and `wish:linkOffer`.

### Privacy

Link import never logs or emits URLs, query strings, hosts, page titles or prices: not in telemetry, not in `console` output, not in R2 keys or `/img/i` paths. Safe-fetch failures carry only a closed failure label and the status code. The normalised URL is stored only inside the cached `meta.json`.

## 20. List import

A user imports a whole wish list from another service, rewish.io first, from Settings in the Mini App or the bot. The flow is preview (no writes besides a job row), an explicit commit, then a background photo drain.

### Architecture

- **One service for every caller.** `src/bot/services/list-import/` holds the business logic: `rewish/` (client, hand-written schema guards, mapping, adapter), `registry.ts` (one adapter per source), `plan.ts` (dedupe and caps), `commit.ts`, `photos.ts` (the drain), `resume-message.ts` and `list-import-service.ts`. `src/worker/list-import.ts` builds the service once per isolate and passes it to the bot, the API and the scheduled tasks; it also exports `kickListImport` and the cron step. The service holds no per-request state; the env, clock, `waitUntil`, optional fetch and Telegram API arrive with every call.
- **Rewish API.** `https://rewish.io/public/api`, GET only, through `safeFetcher.fetchJson` with the allowlist `rewish.io` and the headers `X-Systemcode: ReWish-Web` and a fresh `X-Flow-Id` per call (the honest User-Agent and `Accept: application/json` come from the safe fetcher). A profile link calls `/user/by-code/{slug}`, `/re-wish/{userUuid}` and `/wish/by-rewish-id?rewish_id=` for at most 10 lists; a collection link calls `/collection/get-by-id?id&user_code&access_code`. The access code rides along on every call. Each call has 5 s, the whole fetch 8 s, each body at most 2 MiB. Envelope code 214 is `userNotFound`, 615 `privateCollection`, 0 `invalidUrl`, any other code `upstream`; a body that fails the schema guards is `schemaChanged`; timeouts and network errors are `timeout`; HTTP errors are `upstream`; no item left is `empty`.
- **Mapping.** Status 3 becomes a gifted wish (`removed=1, done=1, gifted_hidden=0`); 0, 1, 2, 4 and unknown values stay active. Currencies 1 UAH, 2 USD, 3 EUR and 5 PLN keep their price; any other currency (14 is ambiguous) drops the price and counts as "no price (other currency)". A zero price is no price. Titles are whitespace-collapsed and cut to 200, descriptions cut to 500, links kept only when renderable. The image is `avatar_path` (wishes) or the first media, else `collection_picture` (collection items), and only `https://storage.rewish.io/...` URLs are kept.
- **Plan.** An item is a duplicate when its normalized title (NFKC, collapsed whitespace, case-folded), normalized link (an empty link never matches) or `source_ref` matches any wish of the owner, removed and gifted ones included, or an earlier item of the batch. Active items are limited to `500 − active wishes`; gifted ones do not use that space. One import creates at most 500 wishes in total. Everything past a limit counts as `overLimit`. A plan with nothing to create is `limitReached` (something was cut by a limit) or `empty`.
- **Jobs.** `list_imports` holds one row per preview: `previewed` → `committing` → `done` or `failed`; `expired` (30 minutes, or a newer preview) and `cancelled`. `source_url` (the canonical link, which can include the access code) is set to null on every terminal state. A partial unique index allows one `committing` job per user; hitting it is the `busy` outcome. A `busy` preview and a `busy` `startCommit` carry the running job's id (null only when that job finished in the meantime), and the bot shows a Refresh button for it.
- **Preview outcomes.** A plan with something to create is `ok` with a job id. A plan with nothing to create returns its counts with `empty` (every item is already in the list) or `limitReached` (something was cut by a limit) and no job; `counts` is null only when the source itself had no items. When `active + gifted` is 0 the bot and the app show the count lines with "Nothing new: every wish is already in your list" (or the limit message for `limitReached`) and no Import action.
- **Visibility.** The preview stores the suggested visibility (hidden for a link with an access code, otherwise public). The bot's toggle stores each change with `setVisibility`, and its Import button calls `startCommit` without a visibility, so the stored value applies. The app keeps its choice locally and sends it with the commit.
- **Commit.** `startCommit` moves a fresh preview to `committing` with a 60 s lease and one attempt; the caller then runs `runCommit` in the background and, once it settles, `kickListImport(service, deps, userId)` so the photos start right away. `runCommit` fetches the source again and re-plans (counts can differ slightly from the preview), stores the new `planned`, then inserts steps of at most 49 rows (7 statements of 7 rows, 13 bound parameters per row). Each step is one D1 batch: the inserts (`on conflict do nothing` on `(user_id, source_ref)`) plus the job update that adds the rows created in that step to `created`/`created_gifted` and renews the lease, so the counters can never drift from the wishes. Imported wishes get `updated_at = job.created_at − source position` (ms), so the owner's list shows the source order, and the hidden choice applies to gifted wishes too. A transient source failure (`timeout`, `upstream`, `rateLimited`) with attempts left pauses the job for the resumer; any other failure fails it.
- **Resume.** A `committing` job whose lease ran out is resumed in place by the ten-minute cron or by a kick: the resumer claims it (one more attempt), and the re-plan skips the rows an earlier pass inserted by `source_ref`. After 3 attempts the job fails with `timeout`. When a resumed bot import finishes, the service edits the stored progress message (`chat_message_id`) with the done or failed text and a Refresh button.
- **Photo drain.** Only the cover photo is imported. Wishes keep the raw URL in `source_image_url` until the photo lands or fails for good. The drain picks owners that have pending URLs **and** at least one `done` or `failed` job, and takes a per-user lease on that user's oldest such job row (`lease_until`). Newer imports only add rows with higher ids, and the daily prune keeps every job of a user with pending photos, so the lease row stays the same while newer imports finish and two drains never work on one user at once (a photo is never sent twice). Those rows never change state again, so the drain lease never collides with a commit lease, and a drain may run while a newer import of the same user is committing. For each pending wish (oldest first) it tries the original image (`_compressed` stripped), then the URL as given, both only on `storage.rewish.io`; downloads go through `downloadTelegramPhoto` (JPEG, PNG or WebP by magic bytes, at most 10 MiB), uploads through `ingestStagedImage` (sendPhoto to the user's own chat, then a background deleteMessage), and the `file_id` is stored with `appendImportedImage`. That update only accepts an active wish or a shown gifted wish with no photos yet, clears the URL in the same statement and never touches `updated_at`, so the list order is kept; after a run that stored any photo, the owner's share row `updated_at` is bumped so the share page fingerprint changes.
- **Drain rules.** Uploads to one chat stay at least 1.2 s apart. A failed download of both candidates, an unsupported image or a Telegram 400 clears that wish's URL. A 403 or a user marked blocked clears every pending URL of that user. The host limiter, a Telegram 429 or any other transient Telegram error stops the run and leaves the URLs for later. Removed non-gifted wishes, hidden gifted wishes and wishes that already have a photo are cleared and skipped. One `LINK_HOST_LIMITER` token per user run. Budgets: 20 s per kick, 5 minutes per cron run. A 500-wish import takes roughly 30–40 minutes of photos.
- **Status.** `ListImportStatusDto` carries the job's `kind` and `visibility`. `photosPending` counts every wish of the user that still has a pending photo URL, not only the job's wishes (wishes carry no job id), so the copy says "photos still loading", never "photos of this import". `planned` and `created` include gifted wishes.
- **Kicks.** `kickListImport(service, deps, userId)` runs `resumeStale` and then `drainPhotos` for that user within 20 s, in `waitUntil`; a kick expires stale previews and resumes stale commits of that user only, while the cron handles every user. Callers kick after a commit, on each app status poll while the job is committing or photos are pending, and on the bot's Refresh button. The bot passes a `waitUntil` that goes through the update's defer queue, so the kick outlives the update.

### Production data copied into preview

The production-to-preview copy skips `list_imports` and wipes it in preview, but `wishes.source_ref` and `wishes.source_image_url` ride along. Those copied wishes have no job row, so the drain never picks them up and the preview bot never sends their photos to anyone. If a tester then imports on preview and their import finishes, the drain also processes their own copied wishes that still have a pending URL; that only affects the tester's own chat.

### Scheduled tasks

| Cron           | Task           | What it does                                                                                                      |
| -------------- | -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `*/10 * * * *` | `import:drain` | Expires previews older than 30 minutes, resumes stale commits, then drains photos for up to 5 minutes.            |
| `0 0 * * *`    | `import:prune` | Deletes terminal jobs older than 30 days, except jobs of users who still have pending photos (the drain's lease). |

Both run only in production (`BOT_ENVIRONMENT` is `production`) while `WISHLIST_IMPORT_ENABLED` is `"true"`, and a failure is logged (`list_import_drain_failed`, `list_import_prune_failed`, error type only) without failing the scheduled run. Previews and local runs have no list import crons, so there kicks are the only thing that moves imports and photos along.

### Flags and bindings

| Name                      | Where                   | Meaning                                                                                                                                                                                                                                                        |
| ------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WISHLIST_IMPORT_ENABLED` | vars, every block       | Kill switch. `"true"` locally and in previews, `"false"` in production until the R4 rollout step (section 17). Off: the app row and the bot button are hidden, the API answers `503 disabled`, and the drain, resume and prune do not run (pending URLs wait). |
| `APP_IMPORT_LIMITER`      | ratelimits, every block | Shared with link import; applies to previews in the app and the bot.                                                                                                                                                                                           |
| `LINK_HOST_LIMITER`       | ratelimits, every block | Shared with link import and between users: one token per preview or commit run (`host:rewish.io`) and one per drain user run. Busy hours slow the photos down.                                                                                                 |
| `BOT_TOKEN`               | secret                  | The drain and the resume message use the Worker's own bot token when no Telegram API is passed in.                                                                                                                                                             |

### Telemetry

- `list_import_completed`, emitted by the service for every finished commit (both triggers), with `channel` from the job, `source`, `kind`, `visibility`, `trigger` (`request`, `resume`), `result` (`success`, `failed`) and `reason` on failure, `createdBucket` and `giftedBucket`. Callers must not emit it again.
- `list_import_photos_drained`, emitted by the service for every cron run and for kicks that did something, with `trigger` (`cron`, `kick`), `result` (`drained`, `budget`, `rateLimited`, `idle`), `ingestedBucket` and `failedBucket`.
- `list_import_previewed` is emitted by the callers (bot and API), which also own the per-user limiter and URL parsing.
- Count buckets: `none`, `oneToNine`, `tenToFortyNine`, `fiftyToTwoHundred`, `overTwoHundred`.

### Privacy

The list import never logs or emits the slug, access code, URLs, titles, prices, job ids or user ids. `source_url` lives only in the job row until a terminal state and is never returned to clients. `source_image_url` is a public CDN URL and is cleared once the photo is processed. Job rows are deleted with the user (`on delete cascade`) and are never copied into preview.

### Troubleshooting

- **Photos never arrive.** Check `list_import_photos_drained`: `rateLimited` runs mean the shared host limiter or Telegram throttled; `idle` from the cron while photos are pending means the owner has no `done` or `failed` job (for example only a copied preview wish). `SELECT count(*) FROM wishes WHERE source_image_url IS NOT NULL` shows the backlog.
- **An import stays `committing`.** It resumes on the next cron or kick once its lease (60 s) is stale, and fails after 3 attempts. While the flag is off nothing resumes.
- **"rewish changed its format".** `schemaChanged` failures mean the guards in `rewish/schema.ts` no longer match; compare a live response with `test/fixtures/list-import/rewish/`.
