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
12. [Share pages](#12-share-pages)
13. [Observability](#13-observability)
14. [Troubleshooting](#14-troubleshooting)
15. [Lessons from princess that apply](#15-lessons-from-princess-that-apply)
16. [Follow-ups](#16-follow-ups)

## 1. Architecture at a glance

| Piece             | Value                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Runtime           | Cloudflare Worker `wishlist` (wrangler env `production`), Hono + Hono JSX + Telegraf                                              |
| Domain            | `wishlist.chernenko.dev` (custom domain): the bot webhook and the public share pages (`/w/<id>`, `/<lang>/w/<id>`, `/robots.txt`) |
| Telegram webhook  | Secret header (`X-Telegram-Bot-Api-Secret-Token`) plus secret path (`TELEGRAM_WEBHOOK_PATH`)                                      |
| Production D1     | `wishlist-production` (`6d194ed1-4446-4092-af68-606a33601801`)                                                                    |
| Preview D1        | `wishlist-preview` (`3ab03825-4610-4164-9bec-2c47d00ac73e`)                                                                       |
| Production queues | `wishlist-release-announcements` (producer and consumer) with dead-letter queue `wishlist-release-announcements-dlq`              |
| Preview queue     | `wishlist-preview-release-announcements` (producer only, nothing consumes it)                                                     |
| Production crons  | `0 0 * * *` (daily maintenance), `*/10 * * * *` (release broadcast and state snapshot)                                            |
| Account           | Cloudflare account `5396970bbe7f97f2d01c5b759444cd40`                                                                             |
| Bots              | Production `@wishlist_ua_bot`, preview `@InevixTestBot`                                                                           |
| Legacy            | Node.js long polling on a VPS with MongoDB Atlas, tagged `legacy-1.7.1` (`924b0e3`). Not part of 2.0.0.                           |

Config lives in `wrangler.jsonc` (strict JSON). The preview Worker shape is under `env.production.previews`.

### How an update is handled

The bot is a stateless router on Telegraf. Telegraf is used only as the update parser and Telegram API client (`bot.handleUpdate`); there is no `Scenes` and no `session()` middleware.

1. The webhook route checks the secret header, caps the body, and claims the `update_id` in the `telegram_updates` ledger so a retried update is not handled twice.
2. Only private chats are served. Updates from groups are ignored without a reply.
3. A `my_chat_member` update with status `kicked` soft-blocks the user (`users.blocked_at`). Status `member` clears it.
4. For a callback, `answerCbQuery` is the first step and the clicked message's inline keyboard is removed (except for item actions that update it in place).
5. The user row is loaded by Telegram id, the profile is synced (username, `telegram_language_code`, `last_seen_at` at most once per hour, `blocked_at` cleared), then the session row is loaded.
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

| Table                   | Purpose                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `users`                 | Registered users (guests have no row). Language, currency, visibility, payments, filter, `release_version`, `blocked_at` |
| `wishes`                | Wishes. `user_id` is `NULL` for wishes imported from users that the legacy bot had already deleted                       |
| `wishlist_shares`       | One row per shared list: opaque ULID `public_id`, `display_name`, `revoked_at` (see section 12)                          |
| `gives`                 | "I want to give" marks, unique per `(user_id, wish_id)`                                                                  |
| `sessions`              | Router state per private-chat user, pruned after 90 days                                                                 |
| `telegram_updates`      | Webhook idempotency ledger, pruned by the daily cron                                                                     |
| `release_announcements` | Announcement status per release version and user (`queued`, `sending`, `sent`, `skipped`, `failed`)                      |

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
- The preview bot serves only the admin. When `BOT_ENVIRONMENT` is `preview` or `local`, every update whose sender is not `ADMIN_ID` is ignored silently: the webhook answers `200 {ignored:true}`, the bot sends no reply, nothing is written to the ledger, and telemetry records outcome `ignored` with rejection reason `previewAccessDenied`. If `ADMIN_ID` is empty, nobody is served. This keeps imported production data (usernames, phone numbers, wishes) away from anyone else who finds the preview bot. To test with another account, temporarily change `ADMIN_ID` for the preview and restore it afterwards.
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

Share pages ship with the additive migration that creates `wishlist_shares` (section 12). The old `users.telegraph_access_token` column stays in the schema, unused and `NULL`, so the code in production keeps working across the deploy. Drop it in 2.1 with two steps: deploy code that no longer lists the column, then migrate (`ALTER TABLE users DROP COLUMN telegraph_access_token`, not a table rebuild).

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

Or open Workers Observability in the Cloudflare dashboard (logs on, traces sampled at 5%).

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

## 12. Share pages

The Worker serves a public page for every list that its owner shared. The pages are server-rendered with Hono JSX (`src/web`), have no client JavaScript, and share the Worker, the D1 binding and the telemetry with the bot.

### Routes

| Route                | Behavior                                                                                                                                                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /w/<id>`        | The link the bot hands out. `302` to `/<lang>/w/<id>`, where the language is the best match of `Accept-Language` among `uk`, `pl`, `en`, else the owner's language. `Vary: Accept-Language`, `Cache-Control: private, no-store`. It is also the `x-default` alternate |
| `GET /<lang>/w/<id>` | The page, with `lang` in `uk`, `en`, `pl`. An uppercase id gets a `301` to the lowercase URL                                                                                                                                                                          |
| `GET /robots.txt`    | Generated per environment (see Indexing)                                                                                                                                                                                                                              |

An id that does not match `^[0-9a-hjkmnp-tv-z]{26}$`, an unknown id, or a list of a blocked owner answers `404`. A stopped share answers `410`. Both are `noindex` and `no-store`. The page itself shows only wishes that are neither hidden nor removed (at most 100, with a notice when there are more), the name saved at consent, the `@username` only if the owner switched it on for the share (`wishlist_shares.show_username`, off by default) and is currently searchable by username, and the owner's payment details. It never shows the phone number, the give list or givers.

### Ids

`wishlist_shares.public_id` is a lowercase ULID (`ulid` package, Web Crypto): 26 Crockford base32 characters, of which the first 10 are a 48-bit millisecond timestamp and the last 16 are 80 random bits. The random part cannot be guessed or walked, unlike a sequential id. The time part does reveal when the share (or the latest "New link") was created, to the millisecond. That is accepted. URLs never contain names or usernames.

Lifecycle:

- The id is created on the first share. Pressing Share again returns the same URL.
- Stop sharing sets `revoked_at`, clears `display_name`, resets `show_username` to off; the page answers `410`.
- Sharing again clears `revoked_at`, so the old link works again and old recipients regain access.
- "New link" replaces `public_id` after a confirmation, for a link that leaked. The old link answers `404`.
- The bot builds the URL from the origin of the webhook request, not from a variable, so a branch preview hands out its own `workers.dev` host.

### Caching

Each page has a fingerprint, the first 16 bytes (hex) of a SHA-256 over: the deploy id (`CF_VERSION_METADATA.id`), the language, the public id, the share's `updated_at`, `show_username`, the username (only if switched on and searchable), the payment details, the currency, the number of visible wishes and the latest `updated_at` among visible wishes. Any wish change, payment or visibility change, and every deploy therefore produces a new fingerprint. Gives and a profile sync that only touches last-seen do not.

- The fingerprint is the `ETag`. Browsers get `Cache-Control: no-cache`, revalidate, and receive `304` on a match.
- The rendered HTML is stored in the Cache API (`caches.default`) under `<origin>/__share-cache/<lang>/<id>/<fingerprint>` with `Cache-Control: public, max-age=86400` and never with cookies. A change makes a new key, so no purge is needed; old entries expire after 24 hours.
- Every `200` carries `Server-Timing: share-cache;desc=hit|miss|bypass`. The second view of an unchanged page must show `hit`.
- The Cache API is per data center, so each data center renders once per fingerprint.
- **Cache API caveat.** It does nothing on `*.workers.dev`. Previews always render and report `miss`. Verify caching only on `https://wishlist.chernenko.dev`.
- `D1` is read twice on a miss (fingerprint, then wishes) and once on a hit or a `304`.

### Indexing and privacy

- A page is `index, follow` only when `BOT_ENVIRONMENT` is `production`, the request host is exactly `wishlist.chernenko.dev`, and the list has at least one visible wish. Everything else (previews, `*.workers.dev` version URLs, empty lists, `404`, `410`) is `noindex`. Canonical and `hreflang` links always use the request origin.
- `robots.txt` allows `/` and disallows `/__share-cache/` on the production host, and disallows everything elsewhere. There is deliberately no sitemap, so lists are never enumerated.
- The first Share shows a consent screen: the Telegram profile name, visible wishes and payment details become public, anyone with the link can open the page, search engines may index it, and sharing can be stopped at any time. The `@username` is listed there as shown only if the owner switches it on (a button on the link screen, offered only to owners who are searchable by username; the choice is forgotten when sharing stops). The name is saved as `display_name` (64 characters at most), refreshed silently on later shares and deleted when sharing stops.
- Pages send `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` and a CSP with `default-src 'none'` and `style-src 'self'` (no inline styles). Owner links get `rel="nofollow ugc noopener noreferrer"`.
- Telemetry never contains the public id (the path is normalized to `/w/:publicId`). Cloudflare invocation logs do contain the path, as they already do for the webhook path.
- Old telegra.ph pages stay online but are no longer updated.

### Assets and data

- `public/` (favicon, Apple touch icon, OG image, `styles/share.css`) is served by the `assets` binding. The icons and the OG image are made from the bot avatar.
- `public/styles/share.css` is generated and committed: `pnpm run css:build` compiles `src/web/styles/share.css` (Tailwind CSS 4 with daisyUI 5, custom themes `wishlist` and `wishlist-dark`, sources `src/web/**/*.ts(x)`). CI runs it and fails on drift. Pages link it as `/styles/share.css?v=<deploy id>`. Every text and background pair of both themes meets WCAG AAA (7:1); `test/share-styles.test.ts` enforces it for the theme colors.
- `pnpm db:copy:production-to-preview` copies `users`, `wishes` and `gives`, deliberately not `wishlist_shares`, so no public id of a real list exists in preview. Create shares in preview through the preview bot.

### Production rollout

1. Apply the `wishlist_shares` migrations to production D1 before the code that reads it is deployed: `pnpm db:migrate:prod`, then `pnpm worker:deploy:prod`. This is an explicit exception to the "no manual production migration before a merge" rule, approved for this release. The migration is additive.
2. Smoke test as the admin: Share, consent, open the link twice (the second view shows `share-cache;desc=hit`), edit a wish and reload, stop (`410`), share again.
3. Check that `share_page_served` events reach New Relic (page `Share pages` of the dashboard).

## 13. Observability

Workers Logs and traces stay enabled in every environment. The Worker emits one safe evlog wide event for each HTTP request, Telegram webhook outcome, scheduled run, release broadcast and release-announcement queue batch. In production, evlog's OTLP drain sends them to New Relic. The `NEW_RELIC_LICENSE_KEY` secret exists only on the production Worker and in the ignored `.dev.vars.production`. Delivery is registered with `waitUntil`, and a drain failure only produces a local warning.

Use the `Log_wishlist` data partition (30-day retention) with the rule `` `service.name` = 'wishlist' AND botEnvironment = 'production' ``. Filter by the same attributes in queries. `eventName`, `outcome`, `elapsedMs`, `commandCategory`, `callbackCategory`, `errorType` and the counts are top-level attributes for NRQL. The measured duration is `elapsedMs`: evlog overwrites `durationMs` and `duration` with its own near-zero elapsed time when an event is emitted, so never chart those two.

Telemetry never contains Telegram identifiers, message text, webhook paths, headers, wish contents, payment details, share page public ids or secrets. `callbackCategory` is a closed prefix such as `wish:edit`, `third:give` or `language:set`, `legacy` or `invalid`, never an id.

Dashboard (import template `docs/newrelic-dashboard.json`; queries read `Log_wishlist`, not the default `Log` event type). One dashboard, `Wishlist Bot`, with four pages and 57 widgets, live at <https://one.eu.newrelic.com/dashboards/detail/ODU2OTkwOHxWSVp8REFTSEJPQVJEfGRhOjI3NjIyMzA?account=8569908>:

| Page        | Widgets | Contents                                                                                                                                                                                                                                                                                                                                   |
| ----------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Production  | 16      | Ingest freshness and rate, webhook failures, outcomes and latency (`elapsedMs`), idempotency outcomes, rejected webhook reasons, processing and Worker errors, scheduled heartbeat and duration, release broadcast coverage, release queue failures, wishes created per day, update and command mix, HTTP 5xx                              |
| Audience    | 15      | Registered and blocked users, active users over 1, 7 and 30 days, snapshots in the last hour, users by language, wishes in the system, hidden and priority wishes, gives, users with payment details, new registrations                                                                                                                    |
| Actions     | 18      | Wishes created, updated and removed, gives added and removed, feedback, updates by field, searches by result (`found`, `notFound`, `self`, `tooLong`), shares by result (`published`, `existing`, `empty`, `failed`), callback mix, pages, filters and language changes, payments, update types, commands by category (real commands only) |
| Share pages | 8       | Page views and cache hit ratio (30 days), page errors, views per day by result, latency p50 and p95 by cache outcome, views by locale, 404 and 410 per day, shares published, stopped and rotated per day                                                                                                                                  |

A data partition receives data only from its creation time, so events sent before `Log_wishlist` existed stay in `Log`; query `FROM Log, Log_wishlist` for the full history.

Key event names:

| Group             | Events                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Webhook           | `telegram_webhook_completed`, `telegram_update_dispatch_failed`, `telegram_update_lease_lost`, `telegram_update_terminalization_failed`, `telegram_update_ledger_unavailable`, `telegram_update_claim_reclaimed`                                                                                                                                                                                                                                                                                                                                                                     |
| HTTP and worker   | `http_request_completed`, `http_request_failed`, `worker_readiness_check_failed`, `worker_readiness_auth_failed`, `worker_admin_auth_failed`                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Scheduled         | `scheduled_worker_invoked`, `scheduled_run_completed`, `scheduled_run_failed`, `telegram_update_ledger_pruned`, `sessions_pruned`, `sessions_prune_failed`                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Release broadcast | `release_broadcast_completed`, `release_broadcast_failed`, `release_broadcast_skipped`, `release_broadcast_stale_recovered`, `release_announcement_sent`, `release_announcement_skipped`, `release_announcement_failed`, `release_announcement_ambiguous`, `release_announcement_handler_error`, `release_announcement_state_write_failed`, `release_announcement_rate_limited`, `release_announcement_invalid_job`, `release_announcement_stale_job`, `release_announcement_notes_missing`, `release_announcement_queue_batch_completed`, `release_announcement_queue_batch_failed` |
| Bot behavior      | `bot_action_completed` with `action` one of `user_registered`, `visibility_changed`, `wish_created`, `wish_updated`, `wish_removed`, `wishlist_cleaned`, `wishlist_shared`, `wishlist_share_stopped`, `wishlist_share_rotated`, `wishlist_filtered`, `wishlist_searched`, `give_added`, `give_removed`, `give_list_cleaned`, `payments_updated`, `payments_removed`, `feedback_sent`, `language_changed`                                                                                                                                                                             |
| Share pages       | `share_page_served` with `result` one of `rendered`, `cached`, `notModified`, `redirected`, `notFound`, `gone`, `error`, `cacheOutcome` one of `hit`, `miss`, `bypass`, plus `locale`, `status`, `elapsedMs` and `visibleWishes`. The path is always the normalized `/w/:publicId`                                                                                                                                                                                                                                                                                                   |
| Telemetry itself  | `new_relic_drain_failed`, `telemetry_emit_failed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

State snapshot and heartbeat. Each run of the `*/10 * * * *` cron emits `bot_state_snapshot` after reading aggregate counts from D1: registered, blocked and active (1, 7, 30 days) users, total, active, hidden, priority and done wishes, gives, users with payment details, and a user count per language (`uk`, `en`, `pl`, `auto`). The snapshot doubles as the cron heartbeat: use the `Snapshots in last hour` widget to catch missing cron activity. A snapshot failure emits `bot_state_snapshot_failed` and does not fail the broadcast or maintenance. A zero error count does not prove that the drain works, so check ingest freshness and the latest scheduled run together when data seems missing.

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
- **Do not edit generated files by hand** (`releases.generated.json`, `worker-configuration.d.ts`, `drizzle/`). CI regenerates them and fails on drift.
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
- **M3. Per-user rate limiting.** Nothing limits how fast one user can drive the bot, the D1 queries and the Telegram calls behind it. Add per-user rate limiting.
- **Drop `users.telegraph_access_token` in 2.1.** The column is unused and `NULL` (the importer no longer writes tokens). Remove it from the Drizzle schema, the importer mapping, the reconcile metric and the fixtures; deploy the code first, then generate and apply the migration.
- **Share page images.** Wish photos are left out of the pages. An image proxy or R2 copies would add them.
- **Per-list OG images.** The link preview uses one static image.
- **Rate limiting the public routes.** `/w/*` is unauthenticated; cache hits are cheap, but nothing limits misses.
- **L1. Low-severity audit finding.** Deferred; details are in the pre-cutover security audit report, which is not stored in the repository.
- **L2. Bot token in URLs.** Telegraf calls `https://api.telegram.org/bot<token>/...`. Check traces and logs (evlog, New Relic, Workers Logs) for the token inside outgoing URLs and scrub it.
- **L4 to L9. Low-severity audit findings.** Deferred; details are in the same audit report.
