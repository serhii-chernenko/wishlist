---
name: preview-bot
description: Test the current branch or PR with the Wishlist preview bot (@InevixTestBot) by pointing its webhook at the branch Worker Preview. Use when the user wants to try a branch, PR or preview in Telegram with the debug or preview bot.
---

# Preview bot

Read `docs/OPERATIONS.md` section 6 first if you have not this session.

## Steps

1. Make sure HEAD is pushed. `pnpm preview:point` refuses an unpushed HEAD; if it is not, push the branch first.
2. Run `pnpm preview:point` and wait for it to finish. It can take up to about 12 minutes (10 for the build check, 2 for readiness), so run it in the background or with a long shell timeout. It waits for the Workers Builds check and for the preview to answer, then points the preview bot webhook at the branch preview. If the output contains `previousOrigin`, tell the user which preview the bot was taken from.
3. Tell the user exactly what to do in a private chat with @InevixTestBot: send `/start`, then the flow under test. State that the production bot (@wishlist_ua_bot) must never be used for branch testing.
4. Offer `pnpm preview:smoke --chat-id <id>` only when the user gives a chat id. It sends a synthetic `/start` to the preview webhook and the bot may reply in that chat.
5. After the PR is merged, run `pnpm preview:reset` to point the preview bot back at the long-lived preview.

## Rules

- Never read or print `.dev.vars*` files.
- Never run `telegram:webhook:*` commands against production.
- Never point the preview bot at anything other than a `*-wishlist.chernenko.workers.dev` preview.
- Never point @wishlist_ua_bot at a preview. The production bot token must never appear in `.dev.vars.preview`.
- After changing the command list in `LL.commands`, run `pnpm telegram:commands:set:preview` for the preview bot.
