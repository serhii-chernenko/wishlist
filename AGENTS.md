# Agent Rules

These rules are strict for this repository.

## Tooling

- Use `pnpm` for everything. The package manager version is pinned in `package.json`; do not run `npm` or `yarn`, and do not commit `package-lock.json`.
- `wrangler.jsonc` stays strict JSON: no comments and no trailing commas. Tests and scripts parse it with `JSON.parse`.
- All repository documentation (`README.md`, `docs/`, `AGENTS.md`, changelog entries for GitHub) is written in English.

## Code Comments

- Do not write inline comments of any kind (`//`, `/* */`, `#` in YAML or shell). Make the code explain itself through naming, small functions and named constants.
- The only allowed exception is a short JSDoc block directly above a function or public API declaration, and only when the signature and body cannot carry the contract or the design rationale themselves. Most functions need none.
- Gotchas, spec references and cross-file invariants belong in `docs/`, the commit message or the pull request description.

## TypeScript and Drizzle

- Keep TypeScript-facing object keys in `camelCase`.
- When Drizzle needs snake_case names in SQLite/D1, use Drizzle casing helpers instead of duplicating raw column-name strings.
- Keep table definitions split by file under `src/db/schemas/`.

## Arrow Functions

- Use concise implicit-return arrows only when the entire arrow function stays on one line.
- Once an arrow body wraps or the line exceeds the configured width, switch to a block body with an explicit `return`.
- Preferred:

```ts
service.use(currentService => currentService);
```

- Forbidden:

```ts
service.use(currentService => expensiveOperation(currentService));
```

This rule is enforced in linting with the custom `arrow-body/explicit-return-for-wrapped-arrow` rule.

## Cloudflare D1

- Do not assume D1 can handle large bound-parameter batches.
- Keep import and migration writes chunked conservatively.
- Treat `100` bound parameters per statement as the safety ceiling unless verified otherwise.
- Prefer chunk sizes derived from `floor(100 / columnCount)` or smaller.

## Production and Preview Data

- Production and preview use separate D1 databases (`wishlist-production` and `wishlist-preview`).
- Never point a preview at the production database.
- Data is copied production to preview only (`pnpm db:copy:production-to-preview --confirm-overwrite-preview`); never the other direction.
- The preview D1 may hold a production copy after the copy command; restrict access to it.
- The preview bot is a separate Telegram bot used for preview traffic only; its username comes from `getMe` for the preview token.
- Never use the preview bot token in production or the production bot token in a preview.

## Deployment

- Cloudflare Workers Builds deploys production (`wishlist`, from `main`) and creates Worker Previews for other branches.
- Workers Builds applies D1 migrations before it deploys: `main` migrates `wishlist-production`, every other branch migrates `wishlist-preview` (`pnpm db:migrate:ci`, see `docs/OPERATIONS.md`). Never run `db:migrate:prod` by hand before a merge.
- Keep migrations additive; ship destructive schema changes in two releases.
- GitHub Actions only validate and publish GitHub release notes (the `release` job in `.github/workflows/main.yml`); do not add a deploy job.

## Worker Previews

- Worker Previews (`env.production.previews`) of the production Worker use their own D1 database, `wishlist-preview`.
- Previews get the preview bot token as a Preview base-config secret, never the production bot token.
- Point the preview bot webhook at a branch preview with `pnpm preview:point` (it wraps `pnpm telegram:webhook:set:preview`) and restore it with `pnpm preview:reset`; see `docs/OPERATIONS.md`.
- Previews run with `BOT_ENVIRONMENT="preview"`: no cron and no release broadcast.

## Mini App

- `src/app/logic/**` stays DOM-free and JSX-free: no `window`, `document` or `Telegram` references. It is the only client code that tests import.
- `src/app/**` and `src/shared/**` never import `src/db`, `src/worker`, `src/api`, `telegraf`, `effect` or `drizzle-orm` (`test/app-boundaries.test.ts`).
- No `style` props in app JSX. The CSP has no inline styles (`style-src 'self'`).
- Never add an `index.html` under `public/app`; the Worker serves the shell at `/app`.
- Never log initData, the `Authorization` header, owner tokens, signed image URLs or Telegram file URLs (`api.telegram.org/file/bot...`), and never return them to clients.
- Telemetry attributes use closed labels only; never put wish ids, public ids, search queries or text in them.
- Regenerate `public/app/*` and `public/styles/share.css` with `pnpm run app:build` and `pnpm run css:build` only; never edit them by hand.
- Business rules stay in `src/bot/services` and `src/bot/input`; the API and the bot call the same code. A new feature needs both a bot change and an app change.
- `.gitignore` is an allowlist: a new top-level source directory must be added there.

## Releases

- `CHANGELOG.md` is the human-owned release history.
- `.changeset/*.md` files are pre-release inputs.
- Every bullet in a changeset is written in Ukrainian and carries nested translation lines directly under it:

```md
- [added] Ukrainian text
    - en: English text
    - pl: Polish text
```

- `releases.generated.json` is the generated runtime artifact for `/releases`.
- Do not edit `releases.generated.json` by hand.
- GitHub Releases are published from `CHANGELOG.md` (English text) by `pnpm releases:github`; never create them by hand for the current version.

## Backup Data

- The `.mongo/` and `.backups/` directories are local-only backup input; only their `.gitkeep` files are tracked.
- You may read from them for validation and migration work.
- Never add their contents, `.dev.vars*` files or `env/*` secrets files to git.

## Operations

- Operators and agents must read `docs/OPERATIONS.md` before any deploy, migration, data copy or release work.

## Observability

- Production Worker telemetry goes to New Relic through evlog's OTLP drain. Local and preview environments do not ingest into New Relic.
- Never include Telegram identifiers, message text, webhook paths, headers, wish contents, share page public ids, or secrets in telemetry attributes. Share page paths are normalized to `/w/:publicId` and home page paths to `/:lang`.
