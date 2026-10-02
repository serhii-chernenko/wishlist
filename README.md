# Wishlist

> Operators: read [docs/OPERATIONS.md](./docs/OPERATIONS.md) first. It is the runbook for deploys, migrations, previews, data copies and releases.

Telegram bot that lets everybody keep a personal wishlist, share it, find the lists of friends and mark gifts they plan to give. The runtime is:

- `Cloudflare Workers`
- `Hono`
- `Telegraf` via webhooks
- `Cloudflare D1`
- `Drizzle ORM`
- `evlog` telemetry sent to New Relic in production

The bot is migrating from the legacy long-polling Node.js and MongoDB implementation to Workers and D1 as version 2.0.0. See [MIGRATION_STATUS.md](./MIGRATION_STATUS.md) before any production action.

## Requirements

- `Node.js >= 22`
- `pnpm >= 10.33.0`
- a Telegram bot token from `@BotFather`
- a Cloudflare account with Workers + D1 enabled

## Local setup

1. Install dependencies:

```sh
pnpm install
```

2. Create local env files from the tracked examples:

```sh
cp .dev.vars.example .dev.vars
cp .dev.vars.production.example .dev.vars.production
cp .dev.vars.preview.example .dev.vars.preview
cp env/.env.d1.example env/.env.d1
```

3. Start the Worker locally (a Cloudflare tunnel is started when `cloudflared.yml` exists, copied from `cloudflared.example.yml`):

```sh
pnpm run dev
```

4. Run repository validation:

```sh
pnpm run check
```

## Documentation

- [docs/OPERATIONS.md](./docs/OPERATIONS.md): deploys, migrations, previews, data copy and releases.
- [AGENTS.md](./AGENTS.md): rules for contributors and coding agents.
- [CHANGELOG.md](./CHANGELOG.md): release history.

## License

[AGPL-3.0-only](./LICENSE)
