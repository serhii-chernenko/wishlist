# Migration Status

Migration of the Wishlist bot from a VPS (Node.js, Telegraf long polling, MongoDB
Atlas, Docker, Ansible) to Cloudflare Workers (Hono, Telegraf webhook, strict
TypeScript, D1 and Drizzle, Queues, Workers Builds), mirroring the Princess bot.

Branch: `feat/migration-to-v2`. Legacy code is tagged `legacy-1.7.1` (`924b0e3`).

## Progress

### Provisioning

- [x] D1 `wishlist-production` `6d194ed1-4446-4092-af68-606a33601801` (eeur)
- [x] D1 `wishlist-preview` `3ab03825-4610-4164-9bec-2c47d00ac73e` (eeur)
- [x] Queues `wishlist-release-announcements` (delivery paused),
      `wishlist-release-announcements-dlq`, `wishlist-preview-release-announcements`
- [x] Local secrets files `.dev.vars`, `.dev.vars.preview`, `.dev.vars.production`,
      `env/.env.d1`, `env/.env.mongo` (all git-ignored)
- [x] Preview bot `@InevixTestBot`, production bot `@wishlist_ua_bot`
- [x] Mongo Atlas reachable locally (299 users, 1202 wishes, 19 gives on 2026-10-02)
- [ ] New Relic `Log_wishlist` data partition
- [ ] Workers Builds connected to `serhii-chernenko/wishlist`
- [ ] Worker Previews base config secrets

### Implementation

- [ ] WP1 Scaffold, tooling, CI, legacy removal
- [ ] WP2 D1 schema, repositories, migrations, Mongo import and reconciliation
- [ ] WP3 Worker runtime, webhook, ledger, queues, observability, ops scripts
- [ ] WP4 Bot runtime, router, session store, simple screens
- [ ] WP5 Wishlist domain screens, telegra.ph sharing
- [ ] WP6 i18n (uk, en), releases tooling, changesets, CHANGELOG history
- [ ] WP7 End-to-end tests and operations docs
- [ ] WP8 Polish translation
- [ ] Independent review and fixes
- [ ] `pnpm run check` green

### Cutover

- [ ] Preview rehearsal: real snapshot imported and reconciled, parity walk-through
- [ ] User approval of copy and the 2.0.0 changelog
- [ ] VPS deploy secrets removed from the GitHub repository
- [ ] VPS container frozen
- [ ] Post-freeze backup via `backup-dbs` (pinned SHA)
- [ ] Production D1 imported and reconciled
- [ ] Production webhook set
- [ ] PR merged, 2.0.0 released on GitHub, announcement broadcast delivered

### Retirement

- [ ] VPS container, image and app directories removed
- [ ] `backup-dbs` no longer backs up wishlist; `wishlist-db` archived
- [ ] Obsolete GitHub secrets and variables removed

## Cutover Record

Filled in during the cutover.
