# Wishlist

> Operators: read [docs/OPERATIONS.md](./docs/OPERATIONS.md) first. It is the runbook for deploys, migrations, previews, data copies, the Mongo to D1 cutover and releases.

Wishlist is a Telegram bot for keeping a personal wish list, sharing it, finding the lists of friends and marking the gifts you plan to give. It speaks Ukrainian, English and Polish.

Bot: [@wishlist_ua_bot](https://t.me/wishlist_ua_bot)

The bot runs on Cloudflare Workers with Cloudflare D1 as of version 2.0.0. The previous version (1.7.1, Node.js long polling, MongoDB, Docker and Ansible on a VPS) is kept only in git history under the tag `legacy-1.7.1`. See [MIGRATION_STATUS.md](./MIGRATION_STATUS.md) for the migration progress.

## What the bot does

### Commands

| Command                        | What it does                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/start`                       | Opens the main menu and cancels any half-finished input                                                                            |
| `/lang [uk\|ua\|en\|pl\|auto]` | Without an argument shows the language screen. With one, sets the interface language. `auto` follows the language of your Telegram |
| `/releases`                    | Shows the release notes of the bot                                                                                                 |

The bot answers only in private chats.

### Main menu

- **Wishlist.** Add wishes with a title, description, up to 9 photos, a link and a price. Edit or remove them, mark a wish as a priority, hide it, filter the list by price, and clean the whole list after a confirmation. Long lists are paginated.
- **Give list.** The wishes of other people that you plan to give. Add and remove entries and clean the list.
- **Find a wish list.** Search by `@username` or by phone number. Third-party lists can be filtered by price, and you can mark a wish as "I want to give".
- **Visibility.** Choose whether others can find you by username, by phone number, or both.
- **Payments requisites.** Add details (a Monobank jar, a card number, a PayPal contact, a Buymeacoffee link) for people who cannot give you a gift and would rather send money.
- **Share.** Publish your wish list as a telegra.ph page and share the link.
- **Stats.** Active users, wishes created and wishes fulfilled all time.
- **Donate.** Ways to support the project.
- **Feedback.** Send a message to the author.
- **Language.** Ukrainian, English, Polish or Auto.

## Tech stack

- Cloudflare Workers (Hono)
- Telegraf as the update parser and Telegram API client, with a hand-written stateless router
- Cloudflare D1 with Drizzle ORM (sessions, users, wishes, gives, update ledger, announcements)
- Cloudflare Queues for release announcements, Cron Triggers for maintenance
- Effect for repositories, typesafe-i18n for the `uk`, `en` and `pl` locales
- evlog telemetry sent to New Relic in production
- Changesets for release notes, Workers Builds for deploys
- Strict TypeScript, oxlint, oxfmt, `tsx --test`

## Requirements

- Node.js 22 or newer
- pnpm 10.33.0 (pinned in `package.json`)
- a Telegram bot token from [@BotFather](https://t.me/BotFather)
- a Cloudflare account with Workers and D1 enabled

## Development

1. Install dependencies:

    ```sh
    pnpm install
    ```

2. Create the git-ignored env files from the committed examples:

    ```sh
    cp .dev.vars.example .dev.vars
    cp .dev.vars.production.example .dev.vars.production
    cp .dev.vars.preview.example .dev.vars.preview
    cp env/.env.d1.example env/.env.d1
    ```

    Fill at least the values of `.dev.vars`:

    ```dotenv
    ADMIN_ID="123456789"
    BOT_TOKEN="123456:telegram-bot-token"
    TELEGRAM_WEBHOOK_SECRET="replace-with-a-secret-token"
    TELEGRAM_WEBHOOK_PATH="/telegram/wishlist-dev"
    WORKER_BASE_URL="https://wishlist-dev.chernenko.dev"
    ```

3. Apply the local D1 migrations:

    ```sh
    pnpm db:migrate:local
    ```

4. For real Telegram delivery into the local Worker, create the Cloudflare tunnel config and follow the comments in it:

    ```sh
    cp cloudflared.example.yml cloudflared.yml
    ```

5. Start the Worker:

    ```sh
    pnpm run dev
    ```

    `pnpm run dev` (alias of `pnpm run worker:dev`) starts `wrangler dev`, starts the `cloudflared` tunnel when `cloudflared.yml` exists, sets the local webhook once the Worker is ready, and deletes it on shutdown. Use `pnpm run worker:dev:raw` for plain `wrangler dev` without the tunnel and webhook automation.

6. Run the tests and the full validation:

    ```sh
    pnpm test
    pnpm run check
    ```

    `pnpm run check` runs the changeset validation, lint, format check, typecheck, the release manifest sync and the tests. CI runs the same command.

The `.dev.vars*` and `env/*` files hold secrets and are never committed. See the [secrets section of the runbook](./docs/OPERATIONS.md#3-secrets-and-environments) for the variable names.

## Scripts

| Script                                                                           | Purpose                                                                  |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `start`, `dev`, `worker:dev`                                                     | Local Worker with the tunnel and webhook automation                      |
| `worker:dev:raw`, `worker:dev:production`                                        | Plain `wrangler dev`, and `wrangler dev` with the production environment |
| `cloudflared:dev`                                                                | Run the Cloudflare tunnel alone                                          |
| `worker:preview`                                                                 | Create or update a Worker Preview (`pnpm worker:preview --name preview`) |
| `worker:deploy`, `worker:deploy:prod`                                            | Manual production deploy, a fallback when Workers Builds is down         |
| `worker:tail:prod`                                                               | Tail production logs                                                     |
| `cf-typegen`                                                                     | Regenerate `worker-configuration.d.ts`                                   |
| `db:generate`                                                                    | Generate a Drizzle migration into `drizzle/`                             |
| `db:migrate:local`, `db:migrate:preview`, `db:migrate:prod`                      | Apply migrations by hand                                                 |
| `db:migrate:ci`                                                                  | Apply migrations inside Workers Builds                                   |
| `db:query:local`, `db:query:preview`, `db:query:prod`                            | Run SQL (`--command "..."`) against local, preview or production D1      |
| `db:import:prepare`, `db:import:prepare:github`                                  | Validate and report a Mongo export without writing                       |
| `db:import:local`, `db:import:preview`, `db:import:prod`                         | One-time import of the legacy Mongo export into D1                       |
| `db:reconcile:preview`, `db:reconcile:prod`                                      | Compare imported D1 data with the Mongo export                           |
| `db:copy:production-to-preview`                                                  | Copy production data into preview (needs `--confirm-overwrite-preview`)  |
| `telegram:webhook:set:{local,preview,prod}`                                      | Set the Telegram webhook                                                 |
| `telegram:webhook:info:{local,preview,prod}`                                     | Show the sanitized webhook info                                          |
| `telegram:webhook:delete:{local,preview,prod}`                                   | Delete the webhook                                                       |
| `telegram:commands:set:{preview,prod}`                                           | Register the bot command list with Telegram                              |
| `preview:url`, `preview:wait`, `preview:point`, `preview:smoke`, `preview:reset` | Point the preview bot at a branch preview and back                       |
| `i18n:generate`, `typesafe-i18n`                                                 | Generate typesafe-i18n types                                             |
| `changeset:add`, `changeset:status`, `changeset:validate`                        | Create, inspect and validate release notes                               |
| `changeset:version`                                                              | Cut a release: validate, version, stamp the changelog, sync the manifest |
| `releases:sync`                                                                  | Regenerate `releases.generated.json` from `CHANGELOG.md`                 |
| `releases:github`                                                                | Publish missing GitHub Releases (run by CI)                              |
| `releases:broadcast:prod`                                                        | Trigger the release announcement broadcast on production                 |
| `lint`, `lint:fix`                                                               | oxlint                                                                   |
| `format`, `format:check`                                                         | oxfmt                                                                    |
| `typecheck`                                                                      | Generate i18n types, then `tsgo --noEmit`                                |
| `test`                                                                           | Run all tests                                                            |
| `check`                                                                          | Full validation used before every push and in CI                         |

## Project layout

```
src/
  worker/      Hono app, webhook route, health and admin routes, queues, cron tasks, telemetry
  bot/         Telegraf bot composition, router runtime, callback_data, screens, services,
               telegra.ph client, input validators, content (keyboards, markup, filters)
  db/          Drizzle client, schemas (one file per table), repositories
  i18n/        typesafe-i18n sources for uk, en and pl
scripts/
  cloudflare/  deploy and local dev helpers
  db/          migrations, Mongo import and reconciliation, production to preview copy
  releases/    changeset validation, changelog stamping, manifest sync, GitHub releases, broadcast trigger
  telegram/    webhook, bot commands and preview bot helpers
drizzle/       generated migrations
docs/          OPERATIONS.md and the New Relic dashboard template
test/          unit and D1 integration tests
.changeset/    pending release notes
.github/       CI workflows (validate and publish GitHub Releases; they never deploy)
```

## Releases

Release notes are written in `.changeset/*.md`. Every bullet is in Ukrainian and carries nested translation lines:

```md
- [added] Український текст.
    - en: English text.
    - pl: Polski tekst.
```

`pnpm run changeset:version` produces `CHANGELOG.md` and the generated `releases.generated.json`, which feeds `/releases` and the announcement sent to users after a deploy. Details are in the [runbook](./docs/OPERATIONS.md#11-releases-and-announcements).

## Documentation

- [docs/OPERATIONS.md](./docs/OPERATIONS.md): deploys, migrations, previews, data copy, the Mongo to D1 cutover, rollback, releases, observability and troubleshooting.
- [MIGRATION_STATUS.md](./MIGRATION_STATUS.md): migration architecture and progress.
- [AGENTS.md](./AGENTS.md): rules for contributors and coding agents.
- [CHANGELOG.md](./CHANGELOG.md): release history.

## Links

- GitHub: [serhii-chernenko/wishlist](https://github.com/serhii-chernenko/wishlist)
- Telegram channel: [t.me/serhii_chernenko](https://t.me/serhii_chernenko)
- YouTube: [youtube.com/@serhii.chernenko](https://youtube.com/@serhii.chernenko)
- X: [x.com/serhiichernenko](https://x.com/serhiichernenko)
- Buy me a coffee: [buymeacoffee.com/serhiichernenko](https://www.buymeacoffee.com/serhiichernenko)
- Princess bot, the author's other Telegram bot: [@ixPrincessBot](https://t.me/ixPrincessBot)

## License

[AGPL-3.0-only](./LICENSE)
