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
- [x] Queues `wishlist-release-announcements` (delivery paused, 14 day retention),
      `wishlist-release-announcements-dlq`, `wishlist-preview-release-announcements`
- [x] Local secrets files `.dev.vars`, `.dev.vars.preview`, `.dev.vars.production`,
      `env/.env.d1`, `env/.env.mongo` (all git-ignored)
- [x] Preview bot `@InevixTestBot`, production bot `@wishlist_ua_bot`
- [x] Mongo Atlas reachable locally (299 users, 1202 wishes, 19 gives on 2026-10-02)
- [ ] New Relic `Log_wishlist` data partition (needs a New Relic login; events go to `Log` until then)
- [x] Workers Builds connected to `serhii-chernenko/wishlist` (script tag `21c2265d1d9f4a7b91f45ee2c28d79e9`)
- [x] Worker Previews base config secrets
- [x] API tokens `wishlist-builds-d1-production` and `wishlist-builds-d1-preview` (D1 Edit)

### Implementation

- [x] WP1 Scaffold, tooling, CI, legacy removal
- [x] WP2 D1 schema, repositories, migrations, Mongo import and reconciliation
- [x] WP3 Worker runtime, webhook, ledger, queues, observability, ops scripts
- [x] WP4 Bot runtime, router, session store, simple screens
- [x] WP5 Wishlist domain screens, telegra.ph sharing
- [x] WP6 i18n (uk, en), releases tooling, changesets, CHANGELOG history
- [x] WP7 End-to-end tests and operations docs
- [x] WP8 Polish translation
- [x] Independent review, security audit and fixes
- [x] `pnpm run check` green (719 tests)

### Cutover

- [x] Preview rehearsal: real snapshot imported and reconciled
- [ ] User approval of copy and the 2.0.0 changelog
- [x] VPS deploy secrets removed from the GitHub repository
- [x] VPS container frozen
- [x] Post-freeze backup via `backup-dbs` (pinned SHA)
- [x] Production D1 imported and reconciled
- [x] Production webhook set
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
- [ ] Guests lose an explicit language choice when their session row is pruned after 90 days.
- [ ] Optionally raise the production webhook `max_connections` after a stable day.

## Cutover Record

All times UTC, 2026-10-02.

- **Production Worker.** Version `e8a3d7c8-5a77-49fb-aea6-d5b1c9a9dae1` deployed from `07693f4` with the 2.0.0 manifest before the freeze. `/health` with the secret returned `ready:true`; without it, 401.
- **Queue.** `wishlist-release-announcements` delivery paused since provisioning; message retention raised to 14 days so a delayed approval cannot expire queued announcements.
- **VPS deploy path closed.** GitHub secrets `SSH_PRIVATE_KEY`, `VPS`, `SSH_PORT` deleted.
- **Legacy freeze.** `wishlist_bot` restart policy set to `no` and stopped at 12:49:27Z. The legacy bot used long polling, so no webhook existed; pending stayed 0.
- **Post-freeze export.** `backup-dbs` run 37009057813 (12:49:43Z) succeeded without a new commit, so the import source is `wishlist-db` `590da4f56a6b8b49a1c2f0a3686deb28795bcb00` (2026-09-29). Live Atlas matched it after the freeze: 299 users, 1202 wishes, 19 gives, same newest wish `updatedAt` (2026-09-02T12:13:29.147Z) and newest user and give ids.
- **D1 Time Travel bookmark** before the import: `00000008-00000000-000050f8-2623bc488d3927ed54b1998c30427379`.
- **Import and reconciliation.** 299 users, 1202 wishes (163 without an owner), 18 gives (1 skipped `missingWish`), 716 images, 260 username-searchable, 108 with a phone, 12 with payments, 48 with a telegra.ph token, `release_version` 1.7.1: 289, 1.7.0: 2, 0.0.0: 8, 0 invalid links, 0 foreign key violations, 0 mismatches.
- **Webhook.** Production webhook set at 12:51:36Z with `drop_pending_updates=false`, `max_connections=1`, `allowed_updates` `message`, `callback_query`, `my_chat_member`; bot commands set for the default scope and uk, en, pl. Downtime about two minutes.
- **Pull request.** [#1](https://github.com/serhii-chernenko/wishlist/pull/1).

### To finish after the announcement text is approved

1. Merge PR #1 with a merge commit. Workers Builds deploys `main` and runs `pnpm releases:broadcast:prod`.
2. `pnpm db:query:prod --command "SELECT status, count(*) FROM release_announcements GROUP BY status"`. The `*/10` cron may already have queued the rows, so the deploy log can report about 0 inserted; the table is the source of truth.
3. `gh release view 2.0.0 -R serhii-chernenko/wishlist` (published by the GitHub release job on `main`).
4. `pnpm exec wrangler queues resume-delivery wishlist-release-announcements`, then repeat step 2 until nothing is `queued`. Pause again with `pause-delivery` on a burst of failures.

### Rollback

Before the VPS cleanup: `pnpm telegram:webhook:delete:prod --drop-pending-updates=false`, then `docker update --restart=always wishlist_bot && docker start wishlist_bot` on the VPS. After the cleanup: rebuild from tag `legacy-1.7.1`; MongoDB Atlas is untouched. D1 data: `wrangler d1 time-travel restore wishlist-production --env production --bookmark=<bookmark>`.
