# Wishlist

> Operators: read [docs/OPERATIONS.md](./docs/OPERATIONS.md) first. It is the runbook for deploys, migrations, previews, data copies, the Mongo to D1 cutover and releases.

Wishlist is a Telegram bot and Mini App for keeping a personal wish list, sharing it, finding the lists of friends and marking the gifts you plan to give. It speaks Ukrainian, English and Polish.

Bot: [@wishlist_ua_bot](https://t.me/wishlist_ua_bot)

The bot runs on Cloudflare Workers with Cloudflare D1 as of version 2.0.0. The previous version (1.7.1, Node.js long polling, MongoDB, Docker and Ansible on a VPS) is kept only in git history under the tag `legacy-1.7.1`. See [MIGRATION_STATUS.md](./MIGRATION_STATUS.md) for the migration progress.

## What the bot does

### Commands

| Command                        | What it does                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/start`                       | Opens the main menu and cancels any half-finished input                                                                            |
| `/lang [uk\|ua\|en\|pl\|auto]` | Without an argument shows the language screen. With one, sets the interface language. `auto` follows the language of your Telegram |
| `/releases`                    | Shows the release notes of the bot                                                                                                 |
| `/app`                         | Replies with a button that opens the Mini App                                                                                      |

The bot answers only in private chats.

### Main menu

- **Wishlist.** Add wishes with a title, description, up to 9 photos, a link, a price and its currency (hryvnia, dollar, euro or złoty). Edit or remove them, give a wish a priority (none, low, medium or high, shown as a colored badge), hide it, reorder its photos (pick which one goes first), filter the list by price, and clean the whole list after a confirmation. Long lists are paginated. Wishes you remove as already given are kept at the end of the list as gifted, and you can hide them one by one. Prices show in your own currency setting (by default hryvnia in Ukrainian, euro in English, złoty in Polish), converted approximately at the daily National Bank of Ukraine rate.
- **Add from a link.** Send the bot a product link, or paste it in the app's first add-wish step, and the title, description, price and photos are filled in from the shop page (JSON-LD, microdata or OpenGraph). A link sent outside any dialog is offered as a new wish. Only JPEG, PNG and WebP photos up to 10 MiB are taken, with no transcoding; the rest are reported as unsupported. If a shop does not share its data, the link is kept and the rest is entered by hand. `LINK_IMPORT_ENABLED` switches the feature off; details are in [docs/OPERATIONS.md](./docs/OPERATIONS.md#19-link-import).
- **Give list.** The wishes of other people that you plan to give. Add and remove entries and clean the list.
- **Find a wish list.** Search by `@username` or by phone number. Third-party lists can be filtered by price, and you can mark a wish as "I want to give".
- **Visibility.** Choose whether others can find you by username, by phone number, or both.
- **Payment info.** Add details (a Monobank jar, a card number, a PayPal contact, a Buymeacoffee link) for people who cannot give you a gift and would rather send money.
- **Delivery address.** Add an address (up to 6 lines) for the people who want to send you a gift.
- **What others see.** Switch on or off whether your payment info, your phone number and your delivery address are shown to people who open your list. The phone and the address are shown only in Telegram, only to registered users, and never on the web page; the address needs the phone to be shown as well. Each switch on asks for a confirmation.
- **Settings.** The currency, the delivery address and the other preferences in one place.
- **Share.** Publish your wish list as a public page on `wishlist.chernenko.dev` (`/ua/w/<id>`, `/en/w/<id>`, `/pl/w/<id>`) in Ukrainian, English or Polish and send the link. The link never changes, the page updates itself after every change, and you can stop sharing at any time or get a new link. The first time, the bot asks for your consent, because the page is public and can appear in search results; a switch lets you ask search engines not to index the page. Visitors can switch the price currency on the page, and you can choose to show your gifted wishes there.
- **Stats.** Active users, wishes created and wishes fulfilled all time.
- **Donate.** Ways to support the project: Monobank, Ko-fi, PayPal and Revolut.
- **Feedback.** Send a message to the author.
- **Language.** Ukrainian, English, Polish or Auto.

### Mini App

Everything the chat does is also available in a Telegram Mini App with the same data: wishes with up to 9 photos (drag and drop, keyboard or "Make first" to reorder them), per-wish currency and priority levels, the give list, search and other people's lists, share settings, "What others see", payments, delivery address, visibility, language, currency, feedback, stats, donate, release notes and about. The chat bot keeps working as before. The Mini App needs iOS 16.4 or newer on iPhone; the bot works everywhere.

- **Open it** from the "Open the app" buttons in the bot, from the bot's profile (`https://t.me/wishlist_ua_bot?startapp`) or with the `/app` command. Share pages also link to it.
- **How it works.** `GET /app` serves a small HTML shell, the client (`hono/jsx/dom`, Tailwind CSS 4 and daisyUI 5 with the gift-tag design) is bundled into the committed files `public/app/app.js` and `public/app/app.css`, and it calls a JSON API under `/api/app/*` authenticated with Telegram `initData`. Photos are uploaded through the bot's own chat, stored as Telegram `file_id`s, and served through an image proxy with an R2 cache, also on public share pages.
- **Switches.** The `MINI_APP_ENABLED` variable turns the whole app off; the architecture, security rules, rollout and troubleshooting are in [docs/OPERATIONS.md](./docs/OPERATIONS.md#17-telegram-mini-app), and the plan is in [docs/plans/mini-app.md](./docs/plans/mini-app.md).
- **Generated files.** `public/app/*` and `public/styles/share.css` are built with `pnpm run app:build` and `pnpm run css:build` and checked for drift in CI. Do not edit them by hand.

## Tech stack

- Cloudflare Workers (Hono, with Hono JSX for the public share pages and the Mini App shell)
- Telegram Mini App client in `hono/jsx/dom`, bundled with esbuild, styled with Tailwind CSS 4 and daisyUI 5
- Telegraf as the update parser and Telegram API client, with a hand-written stateless router
- Cloudflare D1 with Drizzle ORM (sessions, users, wishes, gives, shares, update ledger, announcements)
- Cloudflare Queues for release announcements, Cron Triggers for maintenance and the daily exchange rates refresh
- Cloudflare R2 as a durable image cache and Cloudflare rate-limit bindings for the Mini App API
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

| Script                                                                           | Purpose                                                                                                                                                |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `start`, `dev`, `worker:dev`                                                     | Local Worker with the tunnel and webhook automation                                                                                                    |
| `worker:dev:raw`, `worker:dev:production`                                        | Plain `wrangler dev`, and `wrangler dev` with the production environment                                                                               |
| `cloudflared:dev`                                                                | Run the Cloudflare tunnel alone                                                                                                                        |
| `worker:preview`                                                                 | Create or update a Worker Preview (`pnpm worker:preview --name preview`)                                                                               |
| `worker:deploy`, `worker:deploy:prod`                                            | Manual production deploy, a fallback when Workers Builds is down                                                                                       |
| `worker:tail:prod`                                                               | Tail production logs                                                                                                                                   |
| `cf-typegen`                                                                     | Regenerate `worker-configuration.d.ts`                                                                                                                 |
| `db:generate`                                                                    | Generate a Drizzle migration into `drizzle/`                                                                                                           |
| `db:migrate:local`, `db:migrate:preview`, `db:migrate:prod`                      | Apply migrations by hand                                                                                                                               |
| `db:migrate:ci`                                                                  | Apply migrations inside Workers Builds                                                                                                                 |
| `db:query:local`, `db:query:preview`, `db:query:prod`                            | Run SQL (`--command "..."`) against local, preview or production D1                                                                                    |
| `db:import:prepare`, `db:import:prepare:github`                                  | Validate and report a Mongo export without writing                                                                                                     |
| `db:import:local`, `db:import:preview`, `db:import:prod`                         | One-time import of the legacy Mongo export into D1                                                                                                     |
| `db:reconcile:preview`, `db:reconcile:prod`                                      | Compare imported D1 data with the Mongo export                                                                                                         |
| `db:copy:production-to-preview`                                                  | Copy production data into preview (needs `--confirm-overwrite-preview`)                                                                                |
| `telegram:webhook:set:{local,preview,prod}`                                      | Set the Telegram webhook                                                                                                                               |
| `telegram:webhook:info:{local,preview,prod}`                                     | Show the sanitized webhook info                                                                                                                        |
| `telegram:webhook:delete:{local,preview,prod}`                                   | Delete the webhook                                                                                                                                     |
| `telegram:commands:set:{preview,prod}`                                           | Register the bot command list with Telegram                                                                                                            |
| `preview:url`, `preview:wait`, `preview:point`, `preview:smoke`, `preview:reset` | Point the preview bot (and the admin menu button) at a branch preview and back                                                                         |
| `app:build`, `app:check`                                                         | Build `public/app/app.js` with esbuild; rebuild and fail on drift                                                                                      |
| `app:smoke`                                                                      | Headless Chrome screenshots of every Mini App screen (not run in CI); with `--check-alignment --shots <dir>` it also measures icon and title alignment |
| `css:build`, `css:build:share`, `css:build:app`, `css:check`                     | Build the share and app stylesheets; `css:check` fails on drift                                                                                        |
| `i18n:generate`, `typesafe-i18n`                                                 | Generate typesafe-i18n types                                                                                                                           |
| `changeset:add`, `changeset:status`, `changeset:validate`                        | Create, inspect and validate release notes                                                                                                             |
| `changeset:version`                                                              | Cut a release: validate, version, stamp the changelog, sync the manifest                                                                               |
| `releases:sync`                                                                  | Regenerate `releases.generated.json` from `CHANGELOG.md`                                                                                               |
| `releases:github`                                                                | Publish missing GitHub Releases (run by CI)                                                                                                            |
| `releases:broadcast:prod`                                                        | Trigger the release announcement broadcast on production                                                                                               |
| `lint`, `lint:fix`                                                               | oxlint                                                                                                                                                 |
| `format`, `format:check`                                                         | oxfmt                                                                                                                                                  |
| `typecheck`                                                                      | Generate i18n types, then `tsgo --noEmit` for the Worker and the app                                                                                   |
| `test`                                                                           | Run all tests                                                                                                                                          |
| `check`                                                                          | Full validation used before every push and in CI                                                                                                       |

## Project layout

```
src/
  worker/      Hono app, webhook route, status, health and admin routes, queues, cron tasks, telemetry
  web/         Public home and share pages (Hono JSX): routes, rendering, sitemap, page cache, fingerprint, Tailwind source in styles/;
               the Mini App shell (app-shell/) and the image proxy (image-proxy/)
  api/         Mini App JSON API (/api/app): initData auth, rate limits, owner and image signing, handlers, photo upload
  app/         Mini App client (hono/jsx/dom): screens, UI, navigation, Telegram SDK wrappers, DOM-free logic/, styles
  shared/      Contract code imported by both the Worker and the client: API types, limits, startapp links
  bot/         Telegraf bot composition, router runtime, callback_data, screens, services,
               input validators, content (keyboards, markup, filters, support links)
  db/          Drizzle client, schemas (one file per table), repositories
  i18n/        typesafe-i18n sources for uk, en and pl
scripts/
  cloudflare/  deploy and local dev helpers
  db/          migrations, Mongo import and reconciliation, production to preview copy
  releases/    changeset validation, changelog stamping, manifest sync, GitHub releases, broadcast trigger
  telegram/    webhook, bot commands and preview bot helpers
public/        static assets served by the Worker (favicon, apple touch icon, OG image, generated styles/share.css and app/app.{js,css})
drizzle/       generated migrations
docs/          OPERATIONS.md, plans/ and the New Relic dashboard template
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
- [docs/plans/mini-app.md](./docs/plans/mini-app.md): the Mini App plan and decisions.
- [MIGRATION_STATUS.md](./MIGRATION_STATUS.md): migration architecture and progress.
- [AGENTS.md](./AGENTS.md): rules for contributors and coding agents.
- [CHANGELOG.md](./CHANGELOG.md): release history.

## Links

- GitHub: [serhii-chernenko/wishlist](https://github.com/serhii-chernenko/wishlist)
- Telegram channel: [t.me/serhii_chernenko](https://t.me/serhii_chernenko)
- YouTube: [youtube.com/@serhii.chernenko](https://youtube.com/@serhii.chernenko)
- X: [x.com/serhiichernenko](https://x.com/serhiichernenko)
- Support the author: [Monobank](https://send.monobank.ua/jar/4ZGhPQqyMh), [Ko-fi](https://ko-fi.com/serhiichernenko), [PayPal](https://www.paypal.me/chernenkoserhii), [Revolut](https://revolut.me/serhiichernenko)
- Princess bot, the author's other Telegram bot: [@ixPrincessBot](https://t.me/ixPrincessBot)

## License

[AGPL-3.0-only](./LICENSE)
