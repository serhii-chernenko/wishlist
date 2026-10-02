# Migration Status

Migration of the Wishlist bot from a VPS (Node.js, Telegraf long polling, MongoDB
Atlas, Docker, Ansible) to Cloudflare Workers (Hono, Telegraf webhook, strict
TypeScript, D1 and Drizzle, Queues, Workers Builds), mirroring the Princess bot.
The result is released as version 2.0.0.

Branch: `feat/migration-to-v2`. Legacy code is tagged `legacy-1.7.1` (`924b0e3`).
The step-by-step cutover, rollback and Workers Builds setup are in
[docs/OPERATIONS.md](./docs/OPERATIONS.md); this file tracks progress.

## Target architecture

| Concern           | Legacy 1.7.1                                       | Version 2.0.0                                                                                                             |
| ----------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Runtime           | Node.js process on a VPS (Docker, Ansible)         | Cloudflare Worker `wishlist` (Hono, strict TypeScript) on `wishlist.chernenko.dev`                                        |
| Telegram delivery | Telegraf long polling                              | Telegraf webhook with a secret header and secret path, `max_connections=1` at first                                       |
| Bot logic         | Telegraf Scenes and wizards, in-memory session     | Stateless router on Telegraf: `callback_data` carries action and ids, text input resolved by `session.state.pendingInput` |
| State             | MongoDB Atlas (Mongoose); sessions lost on restart | Cloudflare D1 via Drizzle; sessions stored in D1 (ids only); update ledger for idempotency                                |
| Timers            | 2 second `setTimer` before navigating              | Navigation in the same update; only the photo album debounce (1.5 s, `waitUntil` plus a D1 marker)                        |
| Blocked users     | Deleted with their wishes on a 403                 | Soft-block: `users.blocked_at`, data kept, excluded from search, broadcast and stats                                      |
| Languages         | Ukrainian, plus an unmerged multilang branch       | `uk`, `en`, `pl` and Auto (typesafe-i18n); imported users start in Auto                                                   |
| Rendering         | Markdown; one message per wish                     | HTML parse mode with escaping everywhere; 10 wishes per page                                                              |
| Releases          | Hand-written `changelog.json`                      | Changesets (Ukrainian bullets with nested `en:` and `pl:` lines), `CHANGELOG.md`, generated manifest, `/releases`         |
| Announcements     | None                                               | Cloudflare Queues, one job per registered non-blocked user, delivery held until after the go-live merge                   |
| Deployment        | GitHub Actions to Ansible to the VPS               | GitHub Actions only validate and publish GitHub Releases; Workers Builds deploys production and creates previews          |
| Environments      | One production bot                                 | Production (`wishlist`, D1 `wishlist-production`), Worker Previews (D1 `wishlist-preview`, bot `@InevixTestBot`)          |
| Observability     | Console output                                     | evlog wide events to New Relic (`Log_wishlist` partition, two dashboards); Workers Logs everywhere                        |

Decisions:

- Workers Builds is connected before the cutover, not after, because branch previews, `preview:point` and `db:migrate:ci` need it during preview testing. Nothing is pushed to `main` until the go-live merge.
- The cutover runs from the branch; go-live is the merge of the pull request. The release broadcast is held back by pausing queue delivery, not by a code flag.
- Imported users get `language = NULL` (Auto). Their Telegram language is unknown at import, so the 2.0.0 announcement goes out in Ukrainian with a trilingual language note.
- Wishes of users deleted by the legacy 403 cleanup are imported with `user_id` NULL, so the all-time wish stats still match. They are invisible in the bot.
- Blocked users are soft-blocked and never deleted.
- Groups are ignored; the bot serves private chats only.
- Data expected after the import: 299 users, 1202 wishes (163 with a NULL user), 18 gives (1 skipped, `missingWish`, out of 19), 716 images, `release_version` `1.7.1`: 289, `1.7.0`: 2, `0.0.0`: 8.
- The legacy source stays available through the tag `legacy-1.7.1`. MongoDB Atlas is left untouched as a backup and re-import source.

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

## Follow-ups

Deferred security and robustness items (details in [docs/OPERATIONS.md](./docs/OPERATIONS.md#15-follow-ups)). None blocks the cutover.

- [ ] M1. Separate admin secret for `/admin/release-broadcast` (princess parity).
- [ ] M3. Per-user rate limiting.
- [ ] L1. Deferred low-severity audit item.
- [ ] L2. Check traces and logs for the bot token in outgoing URLs.
- [ ] L4 to L9. Deferred low-severity audit items.

## Cutover Record

Filled in during the cutover.
