# Migration Status

Migration of the Wishlist bot from a VPS (Node.js, Telegraf long polling, MongoDB
Atlas, Docker, Ansible) to Cloudflare Workers (Hono, Telegraf webhook, strict
TypeScript, D1 and Drizzle, Queues, Workers Builds), mirroring the Princess bot.
The result is released as version 2.0.0.

Branch: `feat/migration-to-v2`. Legacy code is tagged `legacy-1.7.1` (`924b0e3`).
The step-by-step cutover, rollback and Workers Builds setup are in
[docs/OPERATIONS.md](./docs/OPERATIONS.md); this file tracks progress.

## Target architecture

| Concern           | Legacy 1.7.1                                       | Version 2.0.0                                                                                                                    |
| ----------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Runtime           | Node.js process on a VPS (Docker, Ansible)         | Cloudflare Worker `wishlist` (Hono, strict TypeScript) on `wishlist.chernenko.dev`                                               |
| Telegram delivery | Telegraf long polling                              | Telegraf webhook with a secret header and secret path, `max_connections=1` at first                                              |
| Bot logic         | Telegraf Scenes and wizards, in-memory session     | Stateless router on Telegraf: `callback_data` carries action and ids, text input resolved by `session.state.pendingInput`        |
| State             | MongoDB Atlas (Mongoose); sessions lost on restart | Cloudflare D1 via Drizzle; sessions stored in D1 (ids only); update ledger for idempotency                                       |
| Timers            | 2 second `setTimer` before navigating              | Navigation in the same update; only the photo album debounce (1.5 s, `waitUntil` plus a D1 marker)                               |
| Blocked users     | Deleted with their wishes on a 403                 | Soft-block: `users.blocked_at`, data kept, excluded from search, broadcast and stats                                             |
| Languages         | Ukrainian, plus an unmerged multilang branch       | `uk`, `en`, `pl` and Auto (typesafe-i18n); imported users start in Ukrainian                                                     |
| Rendering         | Markdown; one message per wish                     | HTML parse mode with escaping everywhere; 10 wishes per page                                                                     |
| Releases          | Hand-written `changelog.json`                      | Changesets (Ukrainian bullets with nested `en:` and `pl:` lines), `CHANGELOG.md`, generated manifest, `/releases`                |
| Announcements     | None                                               | Cloudflare Queues, one job per registered non-blocked user, delivery held until after the go-live merge                          |
| Deployment        | GitHub Actions to Ansible to the VPS               | GitHub Actions only validate and publish GitHub Releases; Workers Builds deploys production and creates previews                 |
| Environments      | One production bot                                 | Production (`wishlist`, D1 `wishlist-production`), Worker Previews (D1 `wishlist-preview`, bot `@InevixTestBot`)                 |
| Observability     | Console output                                     | evlog wide events to New Relic (`Log_wishlist` partition, one `Wishlist Bot` dashboard with five pages); Workers Logs everywhere |

Decisions:

- Workers Builds is connected before the cutover, not after, because branch previews, `preview:point` and `db:migrate:ci` need it during preview testing. Nothing is pushed to `main` until the go-live merge.
- The cutover runs from the branch; go-live is the merge of the pull request. The release broadcast is held back by pausing queue delivery, not by a code flag.
- Imported users get `language = uk`: they have always used the bot in Ukrainian, and Auto would switch everyone whose Telegram is in another language. New users start in Auto. The 2.0.0 announcement carries a trilingual language note.
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
- [x] New Relic `Log_wishlist` data partition and the `Wishlist Bot` dashboard (https://one.eu.newrelic.com/dashboards/detail/ODU2OTkwOHxWSVp8REFTSEJPQVJEfGRhOjI3NjIyMzA?account=8569908)
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
- [x] `pnpm run check` green (807 tests)
- [x] WP9 Share pages: public pages on `wishlist.chernenko.dev` (Hono JSX, ULID links, edge cache, consent), telegra.ph removed, new support links, fourth dashboard page

### Telegram Mini App (in 2.0.0)

- [x] Plan approved (architecture, API, auth, photos, design system): [docs/plans/mini-app.md](./docs/plans/mini-app.md)
- [x] Auth: initData validation, per-user rate limiting (2026-10-03)
- [x] JSON API under /api/app for every bot feature (2026-10-03)
- [x] Photo proxy (token-safe getFile, R2 durable cache) for the app and share pages (2026-10-03)
- [x] Compact card grid for share pages and the app (2026-10-03)
- [x] Photo upload from the app (2026-10-03)
- [x] App UI: Tailwind + daisyUI with the gift-tag design system, Telegram theme, BackButton/MainButton, haptics (2026-10-03)
- [x] Screens: own list, wish editor, give list, search, other lists, share settings, payments, visibility, language, feedback, stats, donate (2026-10-03)
- [x] Bot entry points: "Open app" buttons, `/app` command, startapp deep links, preview menu button (2026-10-03)
- [ ] BotFather: Main Mini App for the preview bot and for production
- [ ] Tests, review, security audit
- [x] Prices in the viewer's language currency (UAH, EUR, PLN) with approximate NBU conversion, per-currency price filters and a daily rates refresh (2026-10-04)
- [ ] Preview test on @InevixTestBot, production rollout
- [ ] Production rollout: apply `20261003214556_many_harry_osborn` and `20261004011719_careless_mulholland_black` (`exchange_rates`) by hand with `pnpm db:migrate:prod` before the deploy, an approved exception to the merge-only migration rule ([OPERATIONS section 17, Rollout runbook](./docs/OPERATIONS.md#rollout-runbook))
- [x] Docs and 2.0.0 changelog: OPERATIONS section 17, README, AGENTS, dashboard page `Mini App`, three 2.0.0 bullets (2026-10-03)

### Batch 2 (in 2.0.0, started 2026-10-04)

- [x] Plan: per-wish currency with a user setting (UAH, USD, EUR, PLN), priority levels, delivery address and disclosure toggles (Telegram only, never on the web), photo reordering, UI polish
- [x] Polish and US English copy reviews
- [x] Foundation: one combined additive migration, contract, seams, i18n skeleton, search indexing flag (954c665)
- [ ] Currency setting, editor currency picker, web currency switcher
- [ ] Priority levels with colored badges (bot single-column menu, app segmented picker)
- [ ] Delivery address, phone and payment disclosure toggles
- [ ] Photo reordering (drag and drop, keyboard, "make first", bot)
- [ ] Polish: sun-moon theme icon, icon and title alignment, short home grid labels, required badge, textarea autosize, muted OFF toggles
- [ ] Gifted wishes at the end of the app list and, when the owner opts in, of shared lists, with a "Gifted" band
- [ ] One pattern for destructive actions in the app: red buttons, a countdown on the button itself, undo toasts for removed items, and destructive confirm popups for bulk actions
- [ ] Copy pass (Polish, US English) over all strings
- [ ] Review, security audit, preview test
- [ ] Rewrite the 2.0.0 currency bullet, add bullets for priority, delivery details and photo order
- [ ] Production rollout additions: Time Travel bookmark, priority count check, new migration, post-deploy priority repair

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

- [x] VPS container, image and app directories removed
- [x] `backup-dbs` no longer backs up wishlist; `wishlist-db` archived
- [x] Obsolete GitHub secrets and variables removed

## Follow-ups

Deferred security and robustness items (details in [docs/OPERATIONS.md](./docs/OPERATIONS.md#16-follow-ups)). None blocks the cutover.

- [ ] M1. Separate admin secret for `/admin/release-broadcast` (princess parity).
- [ ] M3. Per-user rate limiting for the bot webhook (done for the Mini App API).
- [ ] Rate limiting for the public share routes.
- [ ] Drop `users.telegraph_access_token` in 2.1 (deploy code without the column first, then migrate).
- [ ] R2 orphan cleanup: photos removed from wishes stay in R2 (harmless, authorization-gated).
- [ ] S2 and S3 device verification of `requestContact` and the photo file input.
- [ ] Per-list OG images for share pages.
- [ ] L1. Deferred low-severity audit item.
- [ ] L2. Check traces and logs for the bot token in outgoing URLs, including `getFile` downloads.
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
- **Production smoke.** No user wrote during the first hour. A synthetic admin `/start` (`update_id` 1, below any real Telegram id) at 13:52Z was processed end to end on production D1.
- **Preview data.** `pnpm db:copy:production-to-preview --confirm-overwrite-preview` copied 299 users, 1202 wishes and 18 gives; `@InevixTestBot` points at the branch preview and serves only the admin.
- **Legacy retirement.** At about 13:55Z the VPS container `wishlist_bot`, image `wishlist_bot_image` (1.12 GB), `/home/inevix/apps/wishlist` and the 2023 clone `/home/inevix/apps/backup/wishlist-db` were removed; all other containers stayed up. `node:18` stays because `nuxt-demo` builds from it. `backup-dbs` commit `8624b36` stops the wishlist backup (run green), its `WISHLIST_URI` secret was deleted, and `wishlist-db` is archived with its last snapshot `590da4f`. The wishlist repository has no GitHub secrets or variables left. MongoDB Atlas is untouched.
- **Share pages.** Migration `20261002144401_dazzling_centennial` (`wishlist_shares` and the fingerprint index) applied to `wishlist-production` by hand before deploying version `88e2a487` from `0bdab31`, because production runs this branch before the merge. The 48 stored telegra.ph tokens were set to NULL in production and preview; the column is dropped in 2.1.
- **Pull request.** [#1](https://github.com/serhii-chernenko/wishlist/pull/1).

### To finish after the announcement text is approved

0. Restamp the release date: change `## 2.0.0 - 02.10.2026` in `CHANGELOG.md` to the merge day, run `pnpm releases:sync`, re-render the announcement and get the final approval of the text.
1. Check the announcement queue before resuming it. Messages expire after the 14 day retention set on 2026-10-02 (the queued rows were re-enqueued by the cron at about 14:00Z that day). Compare the backlog from `cf queues get 95010b2f32784a0291ec1a20ece8e639` with `SELECT count(*) FROM release_announcements WHERE status = 'queued'`. If the backlog is lower: `pnpm exec wrangler queues purge wishlist-release-announcements --force`, `DELETE FROM release_announcements WHERE status = 'queued'`, wait for the `*/10` cron (or run `pnpm releases:broadcast:prod`) to re-enqueue, verify the counts match, then continue.

2. Merge PR #1 with a merge commit. Workers Builds deploys `main` and runs `pnpm releases:broadcast:prod`.
3. `pnpm db:query:prod --command "SELECT status, count(*) FROM release_announcements GROUP BY status"`. The `*/10` cron may already have queued the rows, so the deploy log can report about 0 inserted; the table is the source of truth.
4. `gh release view 2.0.0 -R serhii-chernenko/wishlist` (published by the GitHub release job on `main`).
5. `pnpm exec wrangler queues resume-delivery wishlist-release-announcements`, then repeat step 2 until nothing is `queued`. Pause again with `pause-delivery` on a burst of failures.

### Rollback

The VPS container is gone: to roll back, delete the production webhook (`pnpm telegram:webhook:delete:prod --drop-pending-updates=false`) and rebuild the legacy bot from tag `legacy-1.7.1`; MongoDB Atlas is untouched. D1 data: `wrangler d1 time-travel restore wishlist-production --env production --bookmark=<bookmark>`.
