# Telegram Mini App with full parity, shipping in 2.0.0: executable plan

## Decisions

- **Architecture.** I kept option (c) from the memo. `GET /app` serves a Hono JSX shell. The client is written in `hono/jsx/dom`, bundled by esbuild into `public/app/app.js`, committed and drift-checked. It calls a JSON API under `/api/app/*`. The scope is full parity, not the memo's MVP.
- **Auth.** Every API call sends `Authorization: tma <initData>`. The server checks the HMAC (secret key = HMAC("WebAppData", BOT_TOKEN)) in constant time, rejects `auth_date` older than 24 h or more than 5 min in the future, and checks that any `Origin` header equals the request origin. Preview and local accept only `ADMIN_ID`, the same gate as the webhook (H3). Rate limits come from the Cloudflare rate-limit binding, keyed per Telegram user.
- **Signing keys.** No new secret. Keys are derived with HMAC-SHA256 from `BOT_TOKEN`, using labels `wishlist:owner-token:v1:<env>` and `wishlist:image-url:v1:<env>`, in the same way `deriveTelegramBotKey` works. Rotating the token invalidates everything, and initData too.
- **Other users' lists.** Access is bound by an opaque owner token: `base36(ownerId).base36(exp).b64url(HMAC("o1|ownerId|viewerUserId|exp"))`, valid 12 h and tied to the viewer. Only a successful search mints one. A share deep link (`s_<publicId>`) mints one only when `isFindableOwner(owner)`; otherwise the list is view-only (keeps H2 and `listForGiver` consistent). One difference from the bot: a token allows gives for any owner searched within 12 h, not only the latest search. Document this.
- **Photos.** The Worker uploads the picked photo with `sendPhoto` to the user's own private chat (raw `fetch` + `FormData`, `disable_notification: true`). It stores the largest `file_id` through the existing `appendImage` (atomic, deduplicated, at most 9), then calls `deleteMessage`. Spike S1 must prove that `file_id` survives the delete; if not, the carrier message stays with a caption. Why not R2:
    - `wishes.images` keeps a single model (JSON array of `file_id` strings).
    - `send.ts` album rendering and the `wish_media_failed` fallback work unchanged for photos added in the app.
    - There is no binding, lifecycle, cost, schema change or migration.
    - One proxy serves both the app and the share pages.
    - R2 would force a second image format into `wishes.images`, dual paths in `send.ts`, URL-based sending in the bot (Telegram fetching our objects), and delete handling.
    - The client resizes before upload (canvas, longest edge 1600 px, JPEG quality 0.85).
- **Photo proxy.** One handler, two URL shapes:
    - App: `/img/w/:wishId/:index/:hash?e=&s=`. HMAC-signed, `exp` rounded up to the next hour plus one hour, so URLs stay stable within the hour and browsers cache them.
    - Share pages: `/img/s/:publicId/:wishId/:index/:hash`. No expiry, which fits share HTML cached for 24 h. A live D1 check runs on every request: share active, owner not blocked, wish visible and owned by the share owner.
    - `:hash` is the first 16 hex characters of SHA-256(file_id). The Cache API stores the bytes under that hash, so a cache hit needs no Telegram call. `getFile` and the download run only on a miss. The upstream `api.telegram.org/file/bot…` URL is never logged or returned.
    - On caching by `file_unique_id`: the stored data has only `file_id`s, and `file_unique_id` would need a `getFile` call first. The SHA-256 of the stored `file_id` is stable and needs no network call, so it is the cache key.
- **Theme.** Our palette always wins. Telegram decides only light or dark, through `WebApp.colorScheme` and the `themeChanged` event, never `prefers-color-scheme`. `setHeaderColor`, `setBackgroundColor` and `setBottomBarColor` are set to `--paper` (`#f1e3fb` / `#1a1220`). The BottomButton is heart `#f57aa6` with black text (8.2:1). `--tg-theme-*` colors are never used for surfaces: they are user-controlled and their contrast can't be tested. Telegram does provide safe-area variables (`--tg-safe-area-inset-*`), which we use.
- **i18n.** A new `app` subtree of plain-text strings lives in the existing typesafe-i18n files. `GET /api/app/bootstrap` returns the resolved locale's raw `app` dictionary. The client runs `i18nObject` from the `typesafe-i18n` runtime (handles `{{plural}}`; verify in WP2B), using type-only imports of the generated types. The bundle carries no translations. Language changes return the new dictionary.
- **Menu button.** Keep the default command menu in production. Entry points:
    - the Main Mini App (profile button and `t.me/wishlist_ua_bot?startapp`),
    - inline `web_app` buttons built from the request origin,
    - a new `/app` command.
- **Migrations.** None. All changes are code, a JSON shape inside `sessions.state` that stays backward compatible, wrangler bindings and vars. `db:migrate:ci` is a no-op.

---

## A. Architecture, layout and build

### A1. New and changed files

```
src/shared/                       contract code imported by both Worker and client (no DOM, no Workers types)
  app-api.ts                      DTOs, request bodies, error codes, route paths, page size, limits
  app-links.ts                    startapp grammar: parseStartParam, buildAppUrl(origin,start), buildMainAppLink(botUrl,start)
src/api/                          Worker JSON API (Hono)
  routes.ts                       registerAppApiRoutes(app, deps): middleware chain + handler registrars
  context.ts                      Hono Variables (actor, user, viewer), ApiDeps (clock, telegram, limiters)
  auth/init-data.ts               validateInitData (pure, injectable subtle)
  auth/signing.ts                 deriveKey, owner tokens, image URL signatures
  auth/middleware.ts              header parse → validate → origin check → preview gate → rate limit → load user
  rate-limit.ts                   bucket selection + 429 mapping
  errors.ts                       ApiError → HTTP status + JSON envelope
  validate.ts                     tiny JSON decoders (no zod), body-size limits
  dto.ts                          record → DTO mappers, image ref minting
  telegram-api.ts                 raw-fetch Telegram client (sendPhoto multipart, deleteMessage, getFile, download, sendMessage); token-safe errors
  handlers/{bootstrap,me,wishes,images,gives,search,lists,share,feedback,info,client-events}.ts
  photos/{upload.ts,validate.ts}
src/web/app-shell/{route.ts,render.tsx,csp.ts}       GET /app, /app/ → 301
src/web/image-proxy/{route.ts,cache.ts}              GET /img/w/*, /img/s/*
src/web/styles/{fonts.css,gift-tag.css}              partials pulled out of share.css
src/app/                          client (hono/jsx/dom), compiled by tsconfig.app.json
  main.tsx, app.tsx
  telegram/{types.ts,sdk.ts,theme.ts,buttons.ts,haptics.ts,popups.ts}
  api/client.ts  i18n/i18n.ts  nav/{router.tsx,routes.ts}  state/store.ts
  media/resize.ts
  ui/{tag,wish-tag,price-chip,heart,envelope,field,toggle,chips,skeleton,toast,empty-state,error-state,photo-grid,photo-picker}.tsx
  screens/*.tsx                   (one file per screen, see D)
  logic/*.ts                      DOM-free and JSX-free; the only client files that tests import
  styles/app.css                  Tailwind v4 + daisyUI 5 entry
public/app/{app.js,app.css}       generated, committed, drift-checked; never an index.html here
scripts/web/{build-app.ts,app-smoke.ts}
tsconfig.app.json
```

Changed:

- Bot: `src/worker/app.ts`, `src/worker/telemetry.ts`, `src/bot/content/keyboards.ts`, `src/bot/screens/{home,wishlist,wish-edit,auth,feedback,payments}.ts`, `src/bot/telegraf/bot.ts`, `src/bot/runtime/{types,session-store}.ts`.
- Services and repositories: `src/bot/services/{wish,share}-service.ts`, new `src/bot/services/feedback-service.ts`, new `src/bot/input/payments.ts`, `src/db/repositories/{wish,session}-repository.ts`.
- Web: `src/web/routes.ts`, `src/web/share/components/{wish-card,share-page}.tsx`, `src/web/share/view-model.ts`, `src/web/styles/share.css`.
- i18n: `src/i18n/{uk,en,pl}/index.ts`.
- Scripts: `scripts/telegram/{webhook,preview}.ts`.
- Config and docs: `package.json`, `tsconfig.json`, `.gitignore`, `.oxfmtrc.json`, `.oxlintrc.json`, `wrangler.jsonc`, `worker-configuration.d.ts`, `.github/workflows/main.yml`, `public/_headers`, the docs, `CHANGELOG.md`, `releases.generated.json`.

### A2. Config facts that silently break things

- **`.gitignore` is an allowlist** (`*` then `!` paths). Without new entries, files under `src/app`, `src/api` and `src/shared` are never committed. Add:
    ```
    !/src/app
    !/src/app/**
    !/src/api
    !/src/api/**
    !/src/shared
    !/src/shared/*.ts
    !tsconfig.app.json
    ```
    `/public/**`, `/src/web/**`, `/scripts/web/*.ts` and flat `/test/*.ts(x)` and `/test/integration/*.ts` are already allowed. Put all new tests flat in `test/` or `test/integration/`.
- **`.oxfmtrc.json`.** Add `public/app/app.js` and `public/app/app.css` to `ignorePatterns`. Otherwise `pnpm format` rewrites the minified bundle and CI fails on drift.
- **`.oxlintrc.json`.** Add an override for `src/app/**` with `env.browser: true`.
- **TypeScript.**
    - Root `tsconfig.json`: add `"exclude": ["src/app/**"]`.
    - New `tsconfig.app.json`: `lib: ["ES2022","DOM","DOM.Iterable"]`, `jsxImportSource: "hono/jsx/dom"`, includes `src/app/**`, `src/shared/**`, `src/bot/input/*.ts`, `src/bot/content/intl.ts`. It must not include `worker-configuration.d.ts`, because its globals clash with the DOM lib.
    - `typecheck` becomes `pnpm run i18n:generate && tsgo -p tsconfig.json --noEmit && tsgo -p tsconfig.app.json --noEmit`.
    - Tests import only `src/app/logic/**` and `src/shared/**`, which use no DOM types, so the root program stays valid.
- **Validators shared with the client.** The client bundles `src/bot/input/{title,description,link,price,limits,remove-command}.ts` and `src/bot/content/intl.ts`. They are pure. Their only `../i18n` import in `intl.ts` is type-only and esbuild drops it.
- **Boundary test (`test/app-boundaries.test.ts`).**
    - `src/app/**` and `src/shared/**` must not import `src/db`, `src/worker`, `src/api`, `telegraf`, `effect` or `drizzle-orm`.
    - `src/app/logic/**` must not reference `window`, `document` or `Telegram`.
    - No `style=` props anywhere in `src/app/**` (the CSP has no inline styles).

### A3. Build pipeline (WP0 adds scripts and the dependency; WP2A writes the build script)

`package.json`:

- `devDependencies`: `"esbuild": "<exact version already in the lockfile>"` (today it is only transitive).
- `app:build`: `tsx scripts/web/build-app.ts`.
- `css:build:share`: the current command.
- `css:build:app`: `tailwindcss -i src/app/styles/app.css -o public/app/app.css --minify`.
- `css:build`: `pnpm run css:build:share && pnpm run css:build:app`.
- `css:check`: build both, then `git diff --exit-code -- public/styles/share.css public/app/app.css`.
- `app:check`: `pnpm run app:build && git diff --exit-code -- public/app/app.js`.
- `app:smoke`: `tsx scripts/web/app-smoke.ts`.

`scripts/web/build-app.ts` esbuild options:

```ts
{ entryPoints: ['src/app/main.tsx'], outfile: 'public/app/app.js', bundle: true, format: 'esm',
  platform: 'browser', target: ['es2020', 'safari15', 'chrome100'], minify: true,
  jsx: 'automatic', jsxImportSource: 'hono/jsx/dom', tsconfig: 'tsconfig.app.json',
  legalComments: 'none', charset: 'utf8', metafile: true, logLevel: 'warning' }
```

- The script fails when the minified size is over 120 KB or the gzip size is over 40 KB.
- There is one bundle, with no code splitting, so the drift check stays simple.

CI (`.github/workflows/main.yml`, drift step):

- Add `pnpm run app:build`.
- `css:build` now builds both.
- Add `public/app` to the `git status` path list.

Workers Builds needs no change because the artifacts are committed.

Generated-file ownership: only the orchestrator commits `public/app/*` and `public/styles/share.css`, regenerated after each WP merge. Coders may build locally but never edit them by hand.

### A4. CSS: how daisyUI and the custom CSS coexist

- `share.css` does not use daisyUI today (no `@plugin`). The OPERATIONS §12 claim about "daisyUI 5 custom themes" is stale; fix it in WP10.
- **Separate bundle `public/app/app.css`**, for three reasons:
    - share pages keep their zero-JS, small-HTML budget and no daisyUI weight,
    - each entry has a different `@source` scope,
    - the app's dark mode is driven by `data-theme`, not the media query.
- **Shared partials** (WP2A extracts them; the share output must stay identical, verified with `git diff public/styles/share.css` and the share screenshots):
    - `src/web/styles/fonts.css`: the seven `@font-face` blocks.
    - `src/web/styles/gift-tag.css`: `@layer components` primitives that use only `var(--paper|--tag|--ink|--text|--heart|--on-heart|--box|--on-box|--heart-ink|--button|--on-button)`. That covers `.sr-only`, `.hero*`, `.wish-tag`, `.wish-heart`, `.wish-title`, `.price`, `.wish-text`, `.wish-link`, `.wish-dates`, `.envelope*`, `.chip`, `.cta`.
    - `share.css` keeps its `:root` and `@media (prefers-color-scheme: dark)` token values. The regex in `test/share-styles.test.ts` keeps working.
- **`src/app/styles/app.css`:**
    ```css
    @import 'tailwindcss' source(none);
    @source '../**/*.tsx'; @source '../**/*.ts';
    @import '../../web/styles/fonts.css';
    @plugin 'daisyui' { themes: false; logs: false; include: button, input, textarea, toggle, radio, badge, skeleton, toast, alert, menu, join, loading, list; }
    @plugin 'daisyui/theme' { name: 'wishlist'; default: true; color-scheme: light;
      --color-base-100:#ffffff; --color-base-200:#f1e3fb; --color-base-300:<lavender shade>; --color-base-content:#000000;
      --color-primary:#f57aa6; --color-primary-content:#000000; --color-secondary:#2aabe2; --color-secondary-content:#000000;
      --color-accent:#7a1040; --color-accent-content:#ffffff; --color-neutral:#000000; --color-neutral-content:#ffffff;
      --color-error:<AAA vs #fff>; --color-error-content:#ffffff; (info/success/warning likewise)
      --radius-box:14px; --radius-field:10px; --radius-selector:999px; --border:2.5px; --depth:0; --noise:0; }
    @plugin 'daisyui/theme' { name: 'wishlist-dark'; color-scheme: dark; base-100 #261b2e, base-200 #1a1220,
      base-content #fbf4ff, neutral #f1e3fb / neutral-content #000000, accent #ffb3d0 / accent-content #000000, primary/secondary as light }
    [data-theme] { --paper: var(--color-base-200); --tag: var(--color-base-100); --ink: var(--color-neutral);
      --text: var(--color-base-content); --heart: var(--color-primary); --on-heart: var(--color-primary-content);
      --box: var(--color-secondary); --on-box: var(--color-secondary-content); --heart-ink: var(--color-accent);
      --button: var(--color-neutral); --on-button: var(--color-neutral-content); }
    @import '../../web/styles/gift-tag.css';
    @layer components { gift-tag overrides for daisyUI: .btn/.input/.textarea/.toggle get 2.5px ink border,
      hard 3px 3px 0 var(--ink) shadow on .btn, press = translate(2px,2px)+shadow 0, focus ring = share focus ring,
      safe-area padding from var(--tg-safe-area-inset-*, env(safe-area-inset-*)) + --tg-content-safe-area-inset-*;
      prefers-reduced-motion disables press translate and skeleton shimmer }
    ```
- **AAA test (`test/app-styles.test.ts`):**
    - Parses both daisyUI theme blocks.
    - Every app theme color equals the matching share token (drift).
    - Every `X` / `X-content` pair, plus `base-content` against `base-100` and `base-200`, is at least 7:1.
    - No `url(http` in the source.
- **Design rules carried into the app** (from DESIGN_SPEC): sentence case, no all-caps, no eyebrow labels, no "·"-joined meta, no "→", Unbounded for titles, prices and the CTA, Commissioner for text, hard offset shadows only.

### A5. Shell, CSP and caching per route

| Route                         | Served by                    | CSP                                                                                                                                                                                                                            | Cache                                                                                                                                                                                                                        |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /app`                    | Worker (`src/web/app-shell`) | `default-src 'none'; script-src 'self' https://telegram.org; connect-src 'self'; img-src 'self' blob: data:; style-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors https://web.telegram.org` | `no-cache`, `ETag` = hash of deploy id + `MINI_APP_ENABLED`, `304` on match; `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: geolocation=(), microphone=()` |
| `GET /app/`                   | Worker                       | share CSP                                                                                                                                                                                                                      | `301` to `/app` (query kept)                                                                                                                                                                                                 |
| `/app/app.js`, `/app/app.css` | assets binding               | n/a                                                                                                                                                                                                                            | `_headers`: `/app/*` `public, max-age=31536000, immutable`; the shell links them with `?v=<deployId>`                                                                                                                        |
| `/api/app/*`                  | Worker                       | `default-src 'none'; frame-ancestors 'none'`                                                                                                                                                                                   | `no-store`, `X-Content-Type-Options: nosniff`, JSON only, no CORS                                                                                                                                                            |
| `/img/w/*`                    | Worker                       | `default-src 'none'; sandbox`                                                                                                                                                                                                  | `private, max-age=3600, immutable`; `Cross-Origin-Resource-Policy: same-origin`                                                                                                                                              |
| `/img/s/*`                    | Worker                       | `default-src 'none'; sandbox`                                                                                                                                                                                                  | `public, max-age=3600`; Cache API stores bytes 7 days by hash                                                                                                                                                                |
| share and home pages          | unchanged                    | unchanged (already `img-src 'self'`)                                                                                                                                                                                           | unchanged; the fingerprint already changes with `wishes.updated_at`, which `appendImage` bumps                                                                                                                               |

- `style-src 'self'` stays strict. The SDK sets `--tg-*` variables through CSSOM, which the CSP allows. Its `set_custom_style` on web.telegram.org writes a `<style>` tag and will be blocked, which we accept because we don't use Telegram theme CSS (spike S4). Fallback: add `'unsafe-inline'` to `style-src` for `/app` only, if a client breaks.
- Shell markup:
    - `<html lang="uk" data-theme="wishlist">`; the client fixes `lang` and `data-theme` before the first paint.
    - `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` (no zoom lock).
    - Font preload, then `app.css?v=`.
    - `<script src="https://telegram.org/js/telegram-web-app.js">` first, then `<script type="module" src="/app/app.js?v=">`.
    - `#root` holds server-rendered tag-shaped skeletons with no text, plus a trilingual `<noscript>`.
    - Config goes into `data-*` attributes on `#root`: `data-bot-url`, `data-env`, `data-version`. No inline script.
- `robots.txt` gets `Disallow: /app`, `/api/` and `/img/`, so photos stay out of image search.
- **Kill switch.** New var `MINI_APP_ENABLED` (`"true"` in all three envs). When it is `"false"`:
    - `/app` renders a server-side "temporarily unavailable" page (language from Accept-Language) with a link to the bot,
    - `/api/app/*` answers `503 {error:{code:'disabled'}}`,
    - the bot hides `web_app` buttons and `/app` replies with the home menu,
    - `/img/s/*` keeps working.

### A6. Rate limits (`wrangler.jsonc`, in all three env blocks; bindings are not inherited)

```json
"ratelimits": [
  { "name": "APP_API_LIMITER", "namespace_id": "2101", "simple": { "limit": 120, "period": 60 } },
  { "name": "APP_SENSITIVE_LIMITER", "namespace_id": "2102", "simple": { "limit": 10, "period": 60 } },
  { "name": "APP_UPLOAD_LIMITER", "namespace_id": "2103", "simple": { "limit": 20, "period": 60 } },
  { "name": "IMAGE_PROXY_LIMITER", "namespace_id": "2104", "simple": { "limit": 300, "period": 60 } }
]
```

- Use `2111–2114` for `env.production.previews` and `2121–2124` for local.
- Keys:
    - API limiters: `tg:<telegramId>`.
    - Image proxy: SHA-256 of `cf-connecting-ip`, checked only on a cache miss.
- Limits are per Cloudflare location, not global; document that.
- `wrangler deploy --dry-run` in CI validates the syntax.
- Verify that `wrangler preview` accepts `ratelimits` under `previews` [unverified]. If it doesn't, the middleware treats a missing limiter as allow and emits `app_rate_limiter_missing`.
- Run `pnpm cf-typegen` afterwards.

---

## B. API contract (`src/shared/app-api.ts` is the literal contract, frozen by WP1A)

### B1. Conventions

- **Auth middleware, in order:**
    1. `MINI_APP_ENABLED`.
    2. If an `Origin` header is present and is not the request origin: 403 `forbidden`.
    3. `Authorization: tma <raw>`. Raw data over 8 KB: 401 `malformed`.
    4. `validateInitData` returns either `{ok:false, reason}` or the user. Reasons: `missing`, `malformed` (duplicate key, bad hash format, bad `user` JSON, `user.id` not a safe integer), `badHash`, `stale` (over 24 h), `future` (over 5 min ahead).
    5. Preview gate: in `preview` or `local`, a `user.id` other than `ADMIN_ID` gets 403 `previewAccessDenied`, with no D1 read and no write.
    6. Limiter for the route's bucket: 429 `rateLimited` with `Retry-After: 60`.
    7. `users.findByTelegramId` (one query). `actor` is the initData user mapped to a Telegraf `User` shape.
    8. Registered-only routes return 403 `registrationRequired` for guests. The registered-only set matches the bot's `REGISTERED_ONLY_SCREENS`.
- **Validation:**
    - `user.is_bot` true: `malformed`.
    - Every field except `hash` goes into the check string, including `signature`.
    - Values are decoded with `URLSearchParams`.
    - The comparison is `crypto.subtle.timingSafeEqual` on bytes.
- **Profile sync** (`users.syncProfile`, which also clears `blocked_at`) runs only in `bootstrap`, not on every call.
- **Error envelope:** `{ error: { code: ApiErrorCode, fields?: Record<string, FieldErrorCode>, retryAfter?: number } }`. Error messages are never sent; the client localizes the codes.
- **Status codes:**
    - 401: `unauthorized` with `reason`.
    - 403: `forbidden`, `previewAccessDenied`, `registrationRequired`, `tokenInvalid`.
    - 404: `notFound`. Used for wishes that are not owned or not visible, so there is no existence oracle.
    - 409: `conflict` (`shareEmpty`, `notShared`, `imagesFull`, `imageChanged`, `ownWish`, `writeAccessRequired`).
    - 410: `tokenExpired`, `shareGone`.
    - 413: `payloadTooLarge`. 415: `unsupportedMedia`. 422: `validation`. 429: `rateLimited`.
    - 502: `upstream` (Telegram), `notDelivered` (feedback).
    - 503: `disabled`. 500: `internal`.
- **Bodies and pages:** JSON body limit 16 KB (`hono/body-limit`). Page size `APP_PAGE_SIZE = 20` (repository `limit` param). Dates are ISO strings. Money is an integer plus a currency code.
- **Third-party money** uses the owner's currency (the bot uses the viewer's). This is an intentional fix and is noted in the docs.

### B2. DTO sketch (load-bearing)

```ts
export type ApiImage = { url: string; hash: string };
export type OwnWishDto = {
    id: number;
    title: string;
    description: string | null;
    link: string | null;
    linkHost: string | null;
    price: number;
    priority: boolean;
    hidden: boolean;
    images: ApiImage[];
    createdAt: string;
    updatedAt: string;
};
export type GiverSummaryDto = {
    kind: 'none' | 'you' | 'somebodyAndYou' | 'somebody';
    count: number;
};
export type ThirdWishDto = Omit<OwnWishDto, 'hidden'> & {
    givers: GiverSummaryDto;
};
export type OwnerDto = {
    token: string | null;
    label: string;
    payments: string | null;
    currency: string;
    source: 'search' | 'share';
    canGive: boolean;
};
export type GiveEntryDto = {
    wish: Omit<ThirdWishDto, 'givers'>;
    currency: string;
    ownerUsername: string | null;
    otherGivers: number;
};
export type MeDto = {
    registered: boolean;
    visibility: 'username' | 'phone' | 'both' | null;
    telegramUsername: string | null;
    phoneMasked: string | null;
    payments: string | null;
    currency: string;
    languageChoice: 'uk' | 'en' | 'pl' | 'auto';
    locale: 'uk' | 'en' | 'pl';
    wishlistFilter: 0 | 1 | 2 | 3 | 4 | null;
    canShowPublicUsername: boolean;
};
export type ShareDto = {
    state: 'empty' | 'unshared' | 'shared';
    url: string | null;
    showUsername: boolean;
    canShowUsername: boolean;
    consent: { name: string; host: string };
};
export type BootstrapDto = {
    me: MeDto;
    messages: AppDictionary;
    counts: { wishes: number; gives: number } | null;
    config: {
        botUrl: string;
        limits: AppLimits;
        priceFilters: {
            filter: number;
            from: number | null;
            to: number | null;
        }[];
        supportLinks: { id: string; title: string; url: string }[];
        links: Record<
            'github' | 'princess' | 'youtube' | 'telegram' | 'x',
            string | null
        >;
    };
};
export type WishDraftInput = {
    title: string;
    description?: string | null;
    link?: string | null;
    price?: string | number | null;
    priority?: boolean;
    hidden?: boolean;
};
export type WishPatchInput = Partial<WishDraftInput>;
```

- Links appear only when `isRenderableLink` passes.
- Title and description go through `cutTitle` and `cutDescription`.
- Third-party payments go through `truncateWithMark(…, 1000)`.
- The phone is masked as `+380 •• ••• 12 34`.

### B3. Endpoints

All paths start with `/api/app`. In the table, "user" means registered-only and "any" also allows guests.

| #   | Method and path                            | Who  | Limit     | Request                                                                                       | 2xx response                                                                                                                                        | Notable errors                                                |
| --- | ------------------------------------------ | ---- | --------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | `GET /bootstrap?platform=&version=&start=` | any  | api       | –                                                                                             | `BootstrapDto`. Runs `syncProfile`; locale from `resolveAppLocale(user.language ?? session.language, initData.language_code ?? stored code)`        | 401, 403                                                      |
| 2   | `GET /me`                                  | any  | api       | –                                                                                             | `MeDto`                                                                                                                                             |                                                               |
| 3   | `PUT /me/visibility`                       | any  | sensitive | `{type:'username'}`                                                                           | `MeDto`. Calls `users.saveVisibility`, which creates the user for a guest                                                                           | 422 `usernameRequired`                                        |
| 4   | `POST /me/visibility/contact-intent`       | any  | sensitive | `{type:'phone'\|'both'}`                                                                      | 204. Sets `pendingInput {kind:'contact', authType, via:'app'}`                                                                                      | 422 `usernameRequired` (both)                                 |
| 5   | `DELETE /me/visibility/contact-intent`     | any  | api       | –                                                                                             | 204. Clears only a pending `contact`                                                                                                                |                                                               |
| 6   | `PUT /me/language`                         | any  | api       | `{choice}`                                                                                    | `{me, messages}`. Users go to `users.language`, guests to `sessions.language`                                                                       | 422                                                           |
| 7   | `PUT /me/payments`                         | user | api       | `{text}`                                                                                      | `MeDto` (`isValidPayments`, at most 1000)                                                                                                           | 422 `tooShort`, `tooLong`                                     |
| 8   | `DELETE /me/payments`                      | user | api       | –                                                                                             | `MeDto`                                                                                                                                             |                                                               |
| 9   | `GET /wishes?offset=`                      | user | api       | –                                                                                             | `{items:OwnWishDto[], total, nextOffset, filter}`. Filter from `users.wishlistFilter`, shared with the bot by design                                |                                                               |
| 10  | `PUT /wishes/filter`                       | user | api       | `{filter:0..4\|null}`                                                                         | `{filter}`                                                                                                                                          | 422                                                           |
| 11  | `POST /wishes`                             | user | api       | `WishDraftInput`                                                                              | 201 `OwnWishDto` (`createWithFields`)                                                                                                               | 422 per field                                                 |
| 12  | `GET /wishes/:id`                          | user | api       | –                                                                                             | `OwnWishDto`                                                                                                                                        | 404                                                           |
| 13  | `PATCH /wishes/:id`                        | user | api       | `WishPatchInput` (explicit booleans, not toggles)                                             | `OwnWishDto`                                                                                                                                        | 404, 422                                                      |
| 14  | `POST /wishes/:id/remove`                  | user | api       | `{done:boolean}`                                                                              | 204 (+ session cleanup)                                                                                                                             | 404                                                           |
| 15  | `POST /wishes/clean`                       | user | sensitive | –                                                                                             | `{removed}` (+ session cleanup)                                                                                                                     |                                                               |
| 16  | `POST /wishes/:id/images`                  | user | upload    | raw body, `Content-Type: image/jpeg\|png\|webp`, at most 10 MB                                | `OwnWishDto`                                                                                                                                        | 404, 409 `imagesFull` or `writeAccessRequired`, 413, 415, 502 |
| 17  | `DELETE /wishes/:id/images/:index?hash=`   | user | api       | –                                                                                             | `OwnWishDto` (optimistic-concurrency `removeImageAt`)                                                                                               | 404, 409 `imageChanged`                                       |
| 18  | `DELETE /wishes/:id/images`                | user | api       | –                                                                                             | `OwnWishDto` (`clearImages`)                                                                                                                        | 404                                                           |
| 19  | `POST /wishes/:id/images/chat-intent`      | user | sensitive | –                                                                                             | 204. Fallback for the upload path: sets `pendingInput wishField images` and sends the bot's `scenes.addImages` or `updateImages` prompt to the chat | 404                                                           |
| 20  | `GET /gives?offset=`                       | user | api       | –                                                                                             | `{items:GiveEntryDto[], total, nextOffset}` (`listForGiver`)                                                                                        |                                                               |
| 21  | `DELETE /gives/:wishId`                    | user | api       | –                                                                                             | 204. Removes an existing give. Used by both the give list and third-party "take"                                                                    | 404                                                           |
| 22  | `POST /gives/clean`                        | user | api       | –                                                                                             | `{removed}`                                                                                                                                         |                                                               |
| 23  | `POST /search`                             | user | sensitive | `{query}` (64 characters max)                                                                 | `{status:'found', owner:OwnerDto}` \| `{status:'notFound'\|'self'\|'tooLong'}` (`searchService.findByQuery`, admin self-search allowed)             |                                                               |
| 24  | `GET /shared/:publicId`                    | user | sensitive | –                                                                                             | `{owner:OwnerDto}`. Label is `display_name` (+ `@username` only if `show_username` and searchable); `token` is null when the owner is not findable  | 404, 410 `shareGone`                                          |
| 25  | `GET /lists/:token/wishes?offset=&filter=` | user | api       | –                                                                                             | `{owner:OwnerDto, items:ThirdWishDto[], total, nextOffset}` (`listVisibleOf` + `giversOf`)                                                          | 403 `tokenInvalid`, 410 `tokenExpired`, 404 owner unavailable |
| 26  | `POST /lists/:token/wishes/:wishId/give`   | user | api       | –                                                                                             | `ThirdWishDto`. Requires a valid token, a visible wish with `wish.userId === ownerId`, a findable owner and a caller who is not the owner           | 403, 404, 409 `ownWish`                                       |
| 27  | `GET /share`                               | user | api       | –                                                                                             | `ShareDto` (`getEntryState`)                                                                                                                        |                                                               |
| 28  | `POST /share/publish`                      | user | sensitive | –                                                                                             | `ShareDto`. Name from `buildAuthorName(actor)`                                                                                                      | 409 `shareEmpty`                                              |
| 29  | `PUT /share/username`                      | user | api       | `{show}`                                                                                      | `ShareDto` (new `setShowUsername`)                                                                                                                  | 409 `notShared`, 422 `usernameUnavailable`                    |
| 30  | `POST /share/rotate`                       | user | sensitive | –                                                                                             | `ShareDto`                                                                                                                                          | 409 `notShared`                                               |
| 31  | `POST /share/stop`                         | user | api       | –                                                                                             | `ShareDto`                                                                                                                                          |                                                               |
| 32  | `POST /feedback`                           | any  | sensitive | `{text}` (at most 2000)                                                                       | 204. Goes through `feedback-service` to `ADMIN_ID`, tagged as sent from the app                                                                     | 422, 502 `notDelivered`                                       |
| 33  | `GET /stats`                               | any  | api       | –                                                                                             | `PublicStats`                                                                                                                                       |                                                               |
| 34  | `GET /releases?offset=&limit=`             | any  | api       | –                                                                                             | `{items:[{version,date,groups:[{group,label,items:string[]}]}], total}` (`getReleases` + `getReleaseItemText` + `getReleaseLabels`)                 |                                                               |
| 35  | `POST /client-events`                      | any  | api       | `{kind:'renderError'\|'networkError'\|'sdkUnsupported'\|'uploadFailed', screen:<closed set>}` | 204 telemetry only                                                                                                                                  | 422                                                           |

**Upload (#16):**

1. Ownership check.
2. Image count is below 9.
3. Type and length checks.
4. `sendPhoto(chat_id = actor.id, disable_notification: true)`.
5. Largest size by `pickLargestPhoto`, then `appendImage`.
6. `deleteMessage` via `waitUntil`, best effort (gated by S1).
7. A Telegram 403 maps to 409 `writeAccessRequired`. Do not soft-block the user here, because they are actively using the app.

**Reused validators and services.**

- Validators: `parseTitle`, `parseDescription(text, [])` (`null` or `""` removes), `parseLink`, `parsePrice` (string or number), `isValidPayments` (moved to `src/bot/input/payments.ts`), `FIND_QUERY_MAX_LENGTH`, `FEEDBACK_MAX_LENGTH`.
- Services: `createWishService`, `createGiveService`, `createSearchService`, `createShareService`, `createUserService`, `createStatsService`, `summarizeGivers`, `isFindableOwner`, `getOwnerPublicUsername`, `getVisibilityType`, `getStoredLanguageChoice`, `getSupportLinks`.
- New repository and service methods (WP1B):
    - `wishes.createWithFields`
    - `wishes.setFlags(wishId, userId, {priority?, hidden?})`
    - `wishes.removeImageAt(wishId, userId, index, expectedJson)`
    - `wishes.findImageFileId(wishId, index)`
    - `wishes.findSharedWishImages(publicId, wishId)` (share active, owner not blocked, wish visible and owned)
    - `sessions.clearWishReferences(telegramUserId, wishIds | 'all')`, conditional on `json_extract`
    - `sessions.setPendingContact` and `sessions.clearPendingContact`
    - `shareService.setShowUsername(user, show)`
    - `feedback-service.deliver({sendMessage}, adminId, actor, text, source)`

### B4. Client i18n strategy (decided)

- The bootstrap and language responses carry `messages`: the raw `app` subtree of one locale.
- The client calls `i18nObject(locale, { app: messages }, {})` from `typesafe-i18n`, typed as `Pick<TranslationFunctions,'app'>`.
- Dates and money go through `formatDate` and `formatCurrency` from `src/bot/content/intl.ts` (Kyiv time zone, the same tags as the bot).
- Fallback, if WP2B finds the runtime does not bundle cleanly: `app:build` also emits `public/app/i18n/{uk,en,pl}.json`, and the client adds a 20-line plural helper.
- The `app` keys are plain text: no HTML and few emoji.
- Chat-side keys added outside `app`:
    - `actions.openApp`
    - `appEntry.text` (reply to `/app`)
    - `commands.app`
    - `auth.success.app`
    - `web.wish.photo({index,total,title})`
    - `web.footer.openInApp`
    - admin `feedback.fromApp`
- Outline of the `app` tree (WP1A writes it completely in uk, en and pl):
    - shared: `common`, `errors`, `outside`, `expired`, `unavailable`
    - screens: `home`, `nav`, `wishes`, `editor`, `photos`, `filters`, `gives`, `find`, `third`, `share`, `payments`, `visibility`, `language`, `feedback`, `stats`, `donate`, `releases`, `about`, `settings`

### B5. Optimistic UI rules

| Optimistic (instant, haptic, roll back and toast on error)                                                                                                                                            | Pessimistic (spinner on button, update on success)                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| priority and hidden toggles (`PATCH` with explicit booleans), give and take on third-party lists, give-list "don't give", own filter chips, third-party filter (client only), `show @username` toggle | create and save (server validation decides), remove wish (after confirm), clean list and give list, publish, rotate, stop, payments, registration and visibility, language (needs the new dictionary), feedback, uploads (per-tile progress) |

- A 404 on an entity removes it from the local cache, shows "This wish no longer exists" and pops the stack. The data may have changed in the chat.
- Revalidate the current screen on the `activated` event (Bot API 8.0) and on `visibilitychange`, so changes made in the bot appear.
- Keep the previous data visible while revalidating.

---

## C. Session and bot interplay, and entry points

### C1. Rules (two views over the same D1, forever)

1. The app never writes `session.find`. Third-party access uses owner tokens; the third-party filter lives in client state. Chat buttons from bot searches stay bound to the bot's own search.
2. The app writes `pendingInput` in exactly three cases:
    - `contact-intent`: `{kind:'contact', authType, via:'app'}`
    - `chat-intent` for photos: `{kind:'wishField', wishId, field:'images'}`
    - cancelling the contact intent clears it.

    It never clears unrelated pending input. A half-written feedback message in the chat survives.

3. Remove and clean in the app call `sessions.clearWishReferences` after success. It clears `pendingInput` only if it is a `wishField` for a removed wish, and clears `album` only if `album.wishId` matches. This is best effort: without it, the bot already handles the case through `renderStaleWish`, so it is cosmetic, not a correctness fix. A failure only logs. A same-batch write isn't needed.
4. Album state and `sessions.media_group_*` are never touched by app uploads, which are single `sendPhoto` calls with no media group.
5. Language and registration go to the same columns the bot reads. The bot's next update sees them (guest to user keyboard, new locale).
6. `syncProfile` in bootstrap clears `blocked_at`, as the webhook does. The upload path never sets it.
7. Chat history is not edited when the app changes data. Every bot button re-reads D1.
8. **Session decoder change (WP1B):** `decodePendingInput` accepts an optional `via: 'app'` on `contact`. Rolling back to the previous Worker version is safe, because the old decoder rebuilds the object and drops `via`.
9. **`screens/auth.ts` with `via:'app'` (WP9):**
    - Success: send only `LL.auth.success.app()`, no home menu.
    - Missing or foreign contact: send the error text, clear pending, no reply-keyboard re-prompt.
    - The app polls `GET /me` every second for up to 15 s and stops when `visibility === requested type`.

### C2. Phone visibility flow (primary path)

1. `POST /me/visibility/contact-intent`.
2. `WebApp.requestContact(cb)`.
3. If `sent`: Telegram posts the contact message into the bot chat (spike S2) and the existing `checkOwnContact` code completes the visibility change.
4. The app polls, then shows success with haptic.
5. If `cancelled`: `DELETE /me/visibility/contact-intent`.

S2 also checks whether the event's `response` string can be checked with the initData HMAC. If it can, a later version may accept it directly; don't build that now.

### C3. Bot entry points (WP9)

- `keyboards.ts`: add `webAppButton(label, url)`, which renders `{text, web_app:{url}}`. URL = `buildAppUrl(resolvePublicOrigin(req.publicOrigin, env), start)`, giving `https://<origin>/app?start=<param>`. Branch previews therefore open their own app.
- Buttons, all hidden when `MINI_APP_ENABLED !== 'true'`:
    - home, guest and user keyboards: first row, `start` omitted
    - wishlist menu: `start=wishes`
    - wish edit menu: `start=w_<id>`
    - share link screen: `start=share`
- New `/app` command:
    - `dispatchCommand` case `app` replies `appEntry.text` with a `web_app` button.
    - Add `app` to `BOT_COMMAND_NAMES` in `scripts/telegram/webhook.ts`.
    - Add `app` to `commandCategories` in telemetry.
    - Rerun `telegram:commands:set:*`.
- **`startapp` grammar** (`src/shared/app-links.ts`, at most 64 characters, `[A-Za-z0-9_-]`): `wishes | add | w_<id> | gives | find | s_<publicId> | share | settings | visibility | payments | language | feedback | stats | donate | releases | about`. The client reads `initDataUnsafe.start_param ?? URLSearchParams(location.search).get('start')`. Both are untrusted routing hints; the API authorizes every call.
- **Share pages (WP6):** a secondary CTA "Open in Telegram and choose a gift" linking to `${WISHLIST_TG_URL}?startapp=s_<publicId>`. In previews this points to the production bot, which then shows "not found"; that is accepted and documented.
- **Menu button decision:** keep the default command menu everywhere in production. Replacing it hides `/start`, `/lang`, `/releases` and `/app`. Revisit later with per-user `setChatMenuButton` once usage data exists.
- **Preview scripts:**
    - `pnpm preview:point` additionally calls `setChatMenuButton({chat_id: ADMIN_ID, menu_button:{type:'web_app', text:'App', web_app:{url:<branch>/app}}})`.
    - `pnpm preview:reset` sets `{type:'default'}`.
    - Both keep the existing `getMe` guard that only allows `@InevixTestBot`.

### C4. BotFather

- **Preview `@InevixTestBot`, one time:**
    - /mybots, Bot Settings, Configure Mini App, Enable Mini App. URL: `https://preview-wishlist.chernenko.workers.dev/app`.
    - Configure Splash Screen: icon from `public/apple-touch-icon.png`, light `#F1E3FB`, dark `#1A1220`.
    - Do not set a Menu Button.
- **Production `@wishlist_ua_bot`** (runbook R6): the same steps with `https://wishlist.chernenko.dev/app`, the same splash, and media previews in uk, en and pl taken from `app:smoke` screenshots. No `/setdomain` and no `/newapp`.
- **Bot API 10.2 origin protection:** the whole app stays on one origin, and external links use `WebApp.openLink`. Check that inline `web_app` buttons pointing at a branch preview origin (different from the configured Main App domain) still work [unverified]. If they don't, test branches through the long-lived `preview` (`pnpm worker:preview --name preview`).

---

## D. Screens and UX

### D1. Navigation model

- An in-memory stack, `src/app/logic/nav.ts`, pure and tested. No URL routing, so `not_found_handling` stays at its default.
- The BackButton is visible when depth is above 1. `onClick` pops, with a dirty guard (`showConfirm(discard)`). Android hardware back maps to it.
- On the root screen, the native header handles close.
- The SettingsButton (7.0) opens Settings.
- On ready: `expand()`, `ready()` after the first paint. `disableVerticalSwipes()` only while an editor is open. `enableClosingConfirmation()` only while dirty.
- Focus moves to the screen `<h1>` on every navigation.

### D2. Telegram native elements per screen

| Screen                   | BottomButton                                                          | Other native elements                                                                |
| ------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Home (user)              | "Add wish"                                                            | SettingsButton                                                                       |
| Home (guest), onboarding | "Get started", which opens Visibility                                 |                                                                                      |
| My wishes                | "Add wish"                                                            | `showPopup` for clean                                                                |
| Wish editor              | "Save" (enabled when dirty and valid, `showProgress` while saving)    | `showPopup` remove: Fulfilled / Just remove / Cancel, mapping to `done` true / false |
| Find                     | "Find"                                                                |                                                                                      |
| Other user's list        | hidden                                                                | `openLink` for wish links                                                            |
| Share, unshared          | "Publish"                                                             |                                                                                      |
| Share, shared            | "Send link" (`openTelegramLink('https://t.me/share/url?url=&text=')`) | `showConfirm` for rotate and stop, clipboard copy                                    |
| Payments, Feedback       | "Save" / "Send"                                                       |                                                                                      |
| Visibility               | "Save" (username) or "Share my number" (`requestContact`)             | `requestWriteAccess` when needed                                                     |

Haptics: `selectionChanged` on chips and toggles, `impactOccurred('light')` on give and take, `notificationOccurred('success'|'error')` on save, upload and failure.

### D3. Screens

All screens are mobile-first, max width 36rem, use gift-tag visuals and daisyUI controls.

1. **Home.**
    - User: hero tag ("Your wish list", counts) and tiles for My wishes, Give list, Find a list, Share. Settings group: Visibility, Payments, Language. About group: Stats, Donate, What's new, Feedback, About.
    - Guest: onboarding hero, the three steps from the home page, Feedback, Stats, Donate, Language, About.
2. **My wishes.**
    - Filter chip row: All, ≤999, 1000–1999, 2000–4999, 5000–9999, ≥10000, formatted in the user's currency.
    - Wish tags show:
        - the heart sticker for priority wishes,
        - the price chip when price > 0,
        - a "Only you see this" badge on hidden wishes,
        - the first photo as a thumbnail,
        - quick priority and hidden toggles.
    - "Show more" button, not infinite scroll.
    - Empty and filtered-empty states.
    - An overflow menu with Share and Clean.
3. **Wish editor** (create and edit):
    - Title (textarea, 200-character counter, inline errors from the parse reasons, including a link in the title).
    - Description (500-character counter).
    - Price (`inputmode="decimal"`, currency suffix, parsed by `parsePrice`).
    - Link (`type="url"`, shows the host).
    - Priority and hidden toggles: instant in edit mode, part of the draft in create mode.
    - Photo grid (at most 9, an add tile using `<input type=file accept="image/*" multiple>`, resize, sequential upload with per-tile progress, remove ×, "Remove all").
    - In create mode: Save calls `POST /wishes` (the full draft), then uploads queued photos.
    - Fallback link "Add photos in the chat" calls `chat-intent`, then `openTelegramLink(botUrl)`.
    - Remove button at the bottom.
4. **Give list.** Tags with `@owner` when it is public, "N others also give", an Open link and "Don't give" (optimistic). Clean with confirm. The empty state has a CTA to Find.
5. **Find.**
    - One input "@username or phone" with a hint.
    - Inline errors for not found, yourself and too long.
    - No search history, for privacy.
6. **Other user's list.**
    - Header tag with the label.
    - Filter chips.
    - Tags with the givers line ("You give", "You and N more", "N people give") and a Give / Don't give toggle.
    - Payments envelope at the end.
    - View-only notice when the token is null.
7. **Share.**
    - `empty`: explains that visible wishes are needed.
    - `unshared`: consent sheet (name, host, bullets from the bot consent) with Publish.
    - `shared`: link card with Copy, Send and Open, a `@username` toggle (only when `canShowUsername`), New link (confirm) and Stop (confirm). A "page empty" note when there are no visible wishes.
8. **Payments.** Textarea with a 1000-character counter, a live envelope preview, and Remove (confirm).
9. **Visibility.**
    - Radio cards Username / Phone / Both. Username is disabled with an explanation when there is no Telegram username.
    - Shows the current state and the masked phone.
    - Contact flow per C2.
10. **Language.** Radio list ordered like `getLanguageChoices(locale)`, plus Auto ("Follows Telegram: …"). Applies immediately and swaps the dictionary.
11. **Feedback.** Textarea, 2000 characters, Send, success state.
12. **Stats.** Three number tags.
13. **Donate.** Support chips (`openLink`) and Telegram channel (`openTelegramLink`).
14. **What's new.** The last 3 releases with "Show more", grouped with labels.
15. **About.** Privacy paragraphs as plain text, plus GitHub, Princess, YouTube, Telegram and X links.
16. **System screens:**
    - Outside Telegram: empty `initData`, CTA `${botUrl}?startapp`.
    - Session expired: 401 `stale`, CTA `WebApp.close()`.
    - Preview only: 403.
    - Unavailable: 503.
    - Unsupported client: Bot API below 6.9 shows a link to the chat bot.
    - Offline banner with Retry.
    - 429 toast using `retryAfter`.

**Loading and accessibility.**

- Loading uses tag-shaped skeletons. The shimmer is off under reduced motion.
- Landmarks (`header`, `main`, `nav`) and one `h1` per screen.
- Visible labels, with errors linked through `aria-describedby`. Counters announce at 90% and at the limit.
- `aria-pressed` on toggles.
- `role="status"` live region for toasts.
- Touch targets at least 44 px.
- Alt text for photos (`web.wish.photo`).
- Color is never the only indicator: the heart sticker comes with sr-only text, and the hidden badge has text.
- `lang` is updated on locale change.
- Off-Telegram or old SDK: in-page fallback buttons replace the BottomButton (`platform === 'unknown'`). The headless smoke uses this.
- iOS keyboard: listen to `viewportChanged`, use `--tg-viewport-stable-height`, and scroll the focused field into view.

---

## E. Telemetry, tests and docs

### E1. Events

All events use closed labels only. No initData, Telegram or user ids, wish ids, public ids, queries, text or URLs.

| Event                                   | Attributes                                                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `app_session_started` (bootstrap)       | `platform` ∈ {ios, android, tdesktop, macos, weba, webk, unknown}, `startKind` ∈ {none, wish, share, screen}, `isGuest`, `locale` |
| `app_api_completed` (every API request) | `route` = `c.req.routePath` (template), `method`, `status`, `outcome`, `errorCode`, `elapsedMs`                                   |
| `app_auth_rejected`                     | `reason` ∈ {missing, malformed, badHash, stale, future, previewAccessDenied, origin}                                              |
| `app_rate_limited`                      | `bucket` ∈ {api, sensitive, upload, image}                                                                                        |
| `app_photo_uploaded`                    | `result` ∈ {appended, duplicate, full, tooLarge, unsupported, writeAccessRequired, telegramError, carrierKept}                    |
| `image_proxy_served`                    | `scope` ∈ {app, share}, `result` ∈ {hit, miss, notFound, forbidden, expired, upstreamError, rateLimited}, `elapsedMs`             |
| `app_client_event`                      | `kind`, `screen` (closed sets)                                                                                                    |
| `bot_action_completed`                  | gains `channel` ∈ {bot, app}; existing bot calls send `bot`                                                                       |

`normalizeTelemetryPath`:

- `/app` and `/app/` become `/app`.
- `/api/app/...` becomes `/api/app` (the detail is in `route`).
- `/img/w/...` becomes `/img/w`, and `/img/s/...` becomes `/img/s`.

Workers invocation logs still contain the raw `/img/s/<publicId>` path (accepted, same as share pages). `redact_query_string` hides the signatures.

**Dashboard (WP10):** a fifth page, "Mini App", in `docs/newrelic-dashboard.json`:

- sessions per day by platform
- start kinds
- API requests by route and status
- API p50 and p95 by route
- API 5xx
- auth rejections by reason
- rate limited by bucket
- actions by channel × action (`FACET channel, action`)
- photo uploads by result
- image proxy hit ratio and latency by scope
- client events by kind

Sample queries:

```sql
SELECT percentile(elapsedMs, 50, 95) FROM Log_wishlist WHERE eventName = 'app_api_completed' AND botEnvironment = 'production' FACET route SINCE 1 day ago
SELECT count(*) FROM Log_wishlist WHERE eventName = 'bot_action_completed' AND botEnvironment = 'production' FACET channel, action SINCE 7 days ago
```

### E2. Tests

Use the node test runner, `getPlatformProxy` and an injected fake Telegram client. No real network calls.

- **`test/app-init-data.test.ts`.** Vectors are generated inside the test with `node:crypto`, independently of the code under test, using the token `123456:TEST`. Cases:
    - valid
    - tampered `user`
    - tampered `auth_date`
    - missing hash
    - uppercase or non-hex hash
    - duplicate key
    - `signature` included in the check string (and the failure when it is left out)
    - `+` and `%20` encodings
    - bad `user` JSON
    - `user.id` not an integer
    - stale (24 h + 1 s)
    - future (+5 min + 1 s)
    - wrong token
    - empty string
    - a spy proving `timingSafeEqual` is called
- **`test/app-signing.test.ts`:**
    - owner token round trip
    - viewer binding (another viewer is rejected)
    - expiry
    - tampering
    - purpose separation: an image signature is not a valid owner token
    - environment separation
    - image URL hour bucketing (same URL within the hour)
- **`test/app-links.test.ts`:** `startapp` grammar, the 64-character limit, `buildAppUrl`.
- **`test/integration/app-auth.test.ts`:**
    - every 401 reason
    - preview and local non-admin get 403 without D1 writes
    - Origin mismatch gets 403
    - 429 with `Retry-After` from a fake limiter
    - `MINI_APP_ENABLED=false` gets 503
    - guest bootstrap
    - user bootstrap runs `syncProfile` and clears `blocked_at`
    - locale chain including Auto
- **`test/integration/app-wishes.test.ts`:**
    - CRUD with validators and per-field 422s
    - IDOR: B gets 404 on A's wish for GET, PATCH, remove and images
    - explicit flags
    - filter persisted in `users.wishlistFilter` and seen by the bot's `getOwnerFilter`
    - remove and clean clear only the matching `pendingInput` and `album`, and keep a `feedback` pending
- **`test/integration/app-third-party.test.ts`:**
    - search found, notFound, self, tooLong, and the admin self case
    - a token for owner A used by C gets 403
    - an expired token gets 410
    - give to a hidden wish, a non-findable owner, an own wish, or a wish of another owner under a token gets rejected
    - give, then the give list shows it, then take
    - a share deep link to a non-findable owner gives `token: null`
    - a revoked share gets 410
- **`test/integration/app-account.test.ts`:**
    - username registration creates the user
    - contact intent writes `via:'app'`; cancel clears only a contact
    - language for a guest writes `sessions.language`, for a user `users.language`
    - payments rules
    - share publish, username, rotate and stop, and the 410 on the share page
    - feedback reaches a fake admin, and a 403 gives 502 `notDelivered` without blocking the sender
    - stats; releases localized
- **`test/integration/app-photos.test.ts`:**
    - the fake `sendPhoto` returns sizes, the largest is appended, `deleteMessage` is called
    - the 10th photo gets 409
    - duplicate
    - 413 and 415
    - a Telegram 403 gets `writeAccessRequired` and `blocked_at` stays null
    - remove at index with a stale hash gets 409
    - `chat-intent` sets pending and sends the prompt
- **`test/integration/image-proxy.test.ts`:**
    - app scope: valid, expired, tampered, wrong hash
    - share scope: active, revoked, hidden wish, blocked owner, wish of another user
    - cache hit makes no Telegram call
    - captured `console` output and responses never contain `api.telegram.org/file/bot` or the token
- **`test/app-shell.test.tsx`:** exact CSP string, noindex, `?v=` asset URLs, no inline script, the disabled page.
- **`test/app-styles.test.ts`** (A4) and **`test/app-bundle.test.ts`:** size budget; no `eval`, `api.telegram.org` or `BOT_TOKEN` in the bundle.
- **`test/app-boundaries.test.ts`** (A2).
- **Client logic:** `test/app-logic-{nav,wish-draft,optimistic,givers,errors,contact-flow}.test.ts` cover pure reducers (rollback, dirty and valid, the poll state machine).
- **Bot:** `test/integration/bot-mini-app-entry.test.ts`:
    - `web_app` buttons with the origin-based URL, hidden when disabled
    - `/app` command
    - `via:'app'` contact completes quietly
    - old `via`-less sessions still decode

    Also update `test/preview-script.test.ts` and `test/telegram-webhook-script.test.ts` (commands and menu button), `test/telemetry.test.ts` (new paths and events, plus a property test that attributes never contain the fixture ids or initData), and `test/web-render.test.tsx` and `share-routes` (photo `<img>` with `/img/s/` URLs, `loading="lazy"`, alt text).

- **`scripts/web/app-smoke.ts`** (`pnpm app:smoke --base http://localhost:8787 --out <dir> [--chrome <path>]`), not run in CI:
    - Reads `ADMIN_ID` and `BOT_TOKEN` from `.dev.vars` without printing them.
    - Signs initData for `ADMIN_ID`.
    - Seeds data through the API: a registered user, 3 wishes, a share.
    - Runs headless Chrome (`--headless=new --window-size=390,844 --virtual-time-budget=6000 --screenshot=<file>`) against `/app#tgWebAppData=<urlenc>&tgWebAppVersion=9.0&tgWebAppPlatform=unknown&tgWebAppThemeParams=<light|dark>&tgWebAppStartParam=<screen>` for every startapp screen in light and dark.
    - Uses the real SDK, which reads the fragment, so no mock file is needed.

### E3. Docs (WP10)

- **OPERATIONS.md:**
    - New §17 "Telegram Mini App": architecture, routes, CSP, auth and window, preview gate, rate limits, owner tokens, photos (upload, proxy, cache, S1 outcome), session rules (C1), entry points, BotFather (preview and production), preview testing with `preview:point`, kill switch and rollback, and new troubleshooting rows.
    - §12: fix the daisyUI claim; add share-page photos and the `/img/s` privacy rules.
    - §13: new events and the fifth dashboard page.
    - §16: M3 done for the API (the webhook stays a follow-up), "Share page images" done, the L2 check extended to `getFile`.
- **README.md:** a Mini App section, `/app` in the commands table, the new scripts, and the project layout (`src/app`, `src/api`, `src/shared`).
- **AGENTS.md:** `src/app/logic` stays DOM-free; no `style` props in app JSX; never `index.html` in `public/app`; never log initData, the `Authorization` header or Telegram file URLs; regenerate `public/app/*` with the build scripts only.
- **MIGRATION_STATUS.md:** tick the Mini App checklist with dates.
- **`.agents/skills/preview-bot/SKILL.md`:** the menu-button step.

---

## F. Work packages, sequencing, rollout

Coder rules: those in `CODER_RULES.md`, plus each WP touches only the files it owns. Contracts in `src/shared/app-api.ts` and the i18n key tree are frozen after WP1A; changes go through the orchestrator.

| WP                                         | Owner and files                                                                                                                                                                                                                                                                                                                                                                                                                                      | Depends on                                          | Acceptance                                                                                                                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **WP0** orchestrator config                | `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `tsconfig.app.json`, `.gitignore`, `.oxfmtrc.json`, `.oxlintrc.json`, `wrangler.jsonc` (ratelimits ×3 envs, `MINI_APP_ENABLED`), `worker-configuration.d.ts`, `.github/workflows/main.yml`, `public/_headers`, placeholder `src/app/main.tsx`                                                                                                                                                     | –                                                   | `pnpm install`; both typechecks pass; `wrangler deploy --env production --dry-run` lists 4 rate limiters and the var; `git check-ignore` confirms new paths are trackable            |
| **WP1A** contracts and auth                | `src/shared/*`, `src/api/{routes,context,errors,validate,dto,rate-limit,telegram-api}.ts`, `src/api/auth/*`, `src/api/handlers/bootstrap.ts` plus **stubs** of every other handler (501) and of `src/web/app-shell/route.ts` and `src/web/image-proxy/route.ts`, `src/worker/app.ts`, `src/worker/telemetry.ts`, `src/i18n/{uk,en,pl}/index.ts` (full `app` tree + chat keys), tests listed in E2 for init-data, signing, links, app-auth, telemetry | WP0                                                 | contract reviewed and frozen; bootstrap works end to end with local D1; `pnpm run check` green                                                                                       |
| **WP1B** domain additions                  | `src/db/repositories/{wish,session}-repository.ts`, `src/bot/runtime/{types,session-store}.ts` (`via`), `src/bot/services/{wish,share}-service.ts`, `src/bot/services/feedback-service.ts`, `src/bot/input/payments.ts`, `src/bot/screens/{feedback,payments}.ts` (use the moved code, behavior unchanged), `test/integration/app-repositories.test.ts`, `test/session-state.test.ts`                                                                | WP0                                                 | all existing tests unchanged and green; every new method covered, including concurrency (`removeImageAt`) and conditional JSON session updates                                       |
| **WP2A** build, CSS, shell                 | `scripts/web/build-app.ts`, `src/web/styles/{fonts,gift-tag,share}.css`, `src/app/styles/app.css`, `src/web/app-shell/*` (replaces stub), `test/app-{shell,styles,bundle,boundaries}.test.ts(x)`, `test/share-styles.test.ts`                                                                                                                                                                                                                        | WP0 (runs alongside WP1)                            | `public/styles/share.css` diff empty, or reviewed and order-only with share screenshots unchanged; AAA test green; CSP exact; build is deterministic (two builds are byte-identical) |
| **WP2B** client core                       | `src/app/{main,app}.tsx`, `src/app/{telegram,api,i18n,nav,state,media}/*`, `src/app/ui/*` (except `photo-picker.tsx`), `src/app/logic/{nav,errors,format}.ts`, `src/app/screens/{index,outside-telegram,session-expired,unavailable,boot-error}.tsx` + **stub** files for every screen in D3, `test/app-logic-{nav,errors}.test.ts`                                                                                                                  | WP1A, WP2A                                          | boots in the smoke harness; theme, safe areas, Back and Bottom buttons, haptics wrappers; typesafe-i18n runtime bundles (or fallback chosen); bundle within budget                   |
| **WP3** API own wishes                     | `src/api/handlers/wishes.ts`, `test/integration/app-wishes.test.ts`                                                                                                                                                                                                                                                                                                                                                                                  | WP1A, WP1B                                          | endpoints 9–15; IDOR and session rules covered                                                                                                                                       |
| **WP4** API third party                    | `src/api/handlers/{search,lists,gives}.ts`, `test/integration/app-third-party.test.ts`                                                                                                                                                                                                                                                                                                                                                               | WP1A, WP1B                                          | endpoints 20–26; token binding, H2 rules, give-list consistency                                                                                                                      |
| **WP5** API account and info               | `src/api/handlers/{me,share,feedback,info,client-events}.ts`, `test/integration/app-account.test.ts`                                                                                                                                                                                                                                                                                                                                                 | WP1A, WP1B                                          | endpoints 1–8 (except bootstrap), 27–35                                                                                                                                              |
| **WP6** photos                             | `src/api/handlers/images.ts`, `src/api/photos/*`, `src/web/image-proxy/*` (replaces stub), `src/web/share/components/{wish-card,share-page}.tsx`, `src/web/share/view-model.ts`, `src/web/routes.ts` (photo refs, robots, open-in-app CTA); **photo CSS appended to `src/web/styles/gift-tag.css` only after WP2A is merged**; `test/integration/{app-photos,image-proxy}.test.ts`, `test/web-render.test.tsx`, share-routes test                    | WP1A, WP1B, WP2A                                    | endpoints 16–19; proxy rules; no token in any output; share HTML under 60 KB for 20 wishes                                                                                           |
| **WP7** screens A                          | `src/app/screens/{home,onboarding,wishes,wish-editor,gives}.tsx`, `src/app/ui/photo-picker.tsx`, `src/app/logic/{wish-draft,optimistic}.ts`, `test/app-logic-{wish-draft,optimistic}.test.ts`                                                                                                                                                                                                                                                        | WP2B (codes against the contract with fixture DTOs) | D3 items 1–4 with all states; smoke screenshots light and dark                                                                                                                       |
| **WP8** screens B                          | `src/app/screens/{find,third-list,share,payments,visibility,language,feedback,stats,donate,releases,about,settings}.tsx`, `src/app/logic/{givers,contact-flow}.ts`, tests                                                                                                                                                                                                                                                                            | WP2B                                                | D3 items 5–16; contact poll state machine tested                                                                                                                                     |
| **WP9** bot integration                    | `src/bot/content/keyboards.ts`, `src/bot/screens/{home,wishlist,wish-edit,auth}.ts`, `src/bot/telegraf/bot.ts`, `src/worker/routes/telegram.ts` (`channel:'bot'`), `scripts/telegram/{webhook,preview}.ts`, `test/integration/bot-mini-app-entry.test.ts`, preview and webhook script tests                                                                                                                                                          | WP1A, WP1B                                          | C1 items 8–9 and C3; all bot tests green                                                                                                                                             |
| **WP10** docs, dashboard, changelog, smoke | `docs/OPERATIONS.md`, `README.md`, `AGENTS.md`, `MIGRATION_STATUS.md`, `.agents/skills/preview-bot/SKILL.md`, `docs/newrelic-dashboard.json`, `CHANGELOG.md`, `releases.generated.json` (via `releases:sync`), `scripts/web/app-smoke.ts`                                                                                                                                                                                                            | docs from phase 2; final after WP7–9                | `pnpm releases:sync` clean; `renderReleaseNotes` for 2.0.0 fits within 4096 characters in uk, en and pl (merge bullets if not); dashboard JSON valid                                 |
| **WP11** copy and Polish                   | `src/i18n/{uk,en,pl}/index.ts` (copy fixes only, keys frozen)                                                                                                                                                                                                                                                                                                                                                                                        | WP7, WP8                                            | key parity test green; DESIGN_SPEC copy rules                                                                                                                                        |
| **WP12** review, security audit, device QA | no code; findings go back to the owning WP                                                                                                                                                                                                                                                                                                                                                                                                           | all                                                 | no High or Medium findings open; spikes S1–S5 recorded                                                                                                                               |

**Sequencing:**

1. Phase 0: WP0.
2. Phase 1, in parallel: WP1A, WP1B, WP2A.
3. Phase 2, in parallel: WP2B, WP3, WP4, WP5, WP6, WP9, and WP10 docs.
4. Phase 3: WP7 and WP8.
5. Phase 4: integration. The orchestrator regenerates `public/app/*` and `share.css`, then runs `pnpm run check`, `css:check`, `app:check` and `app:smoke`.
6. Phase 5: WP11 and WP12, fixes, then the preview spikes and QA, then the rollout.

### Spikes (on preview, before the production deploy)

- **S1.** After `deleteMessage`, the `file_id` still works for `getFile` and `sendPhoto` after 10 minutes and after 24 hours. If not, keep the carrier message with the caption `app.photos.carrier`.
- **S2.** On iOS, Android and Desktop, `requestContact` posts a contact message to the chat and the `via:'app'` path completes. Also check whether the `response` string validates with the HMAC. Test once with a second account that never started the bot, by temporarily changing preview `ADMIN_ID` as described in OPERATIONS §5.
- **S3.** The file input works on iOS, Android, macOS, tdesktop on Windows and Linux, and web K and A. Where it fails, the chat-intent fallback is visible.
- **S4.** With strict `style-src`, web.telegram.org shows no broken UI and only the expected `set_custom_style` CSP warnings.
- **S5.** Workers Logs and traces contain no `Authorization` header and no `api.telegram.org/bot…` or `/file/bot…` URLs (L2).

### Rollout runbook

No D1 migration. Production already runs this branch, so this follows the share-page precedent.

1. **R0.** All WPs merged on `feat/migration-to-v2`. `pnpm run check` green, and the CI drift check covers `public/app`. Security audit fixes are in.
2. **R1.** Push. Workers Builds builds the preview, and `db:migrate:ci` reports nothing pending. Then run `pnpm preview:point`, which now also sets the admin's menu button to the branch `/app`, and `pnpm telegram:commands:set:preview`.
3. **R2.** One-time BotFather setup for `@InevixTestBot` (C4).
4. **R3.** Run S1–S5. Walk the full parity checklist in the app and cross-check each feature in the chat:
    - Create in the app and see it in the bot.
    - Edit in the bot and see it after Retry or `activated` in the app.
    - With a pending `wishField` in the chat, remove that wish in the app; the next chat text goes to the home menu.
    - Give in the app and see it in the bot give list.
    - Stop sharing in the app; the page answers 410.
    - Upload 3 photos in the app; the bot album shows them and the share page shows them.
    - Language Auto, feedback reaches the admin, stats, donate, what's new, a deep link `s_<id>`, and an old chat button.

    Device matrix: iOS, Android, Telegram Desktop on Windows and Linux, Telegram macOS, web K and A. Run `pnpm app:smoke` and keep the screenshots for media previews.

5. **R4.** Check that `MINI_APP_ENABLED` is `"true"` in production, then run `pnpm worker:deploy:prod` from the branch.
    - `curl -sI https://wishlist.chernenko.dev/app` returns 200 with the exact CSP.
    - `/api/app/bootstrap` without auth returns 401.
    - `/app/app.js` is immutable.
    - A share page with photos serves `/img/s/...` with 200, and the second view hits the cache.
    - Run `pnpm telegram:commands:set:prod` to add `/app`.
6. **R5.** BotFather production: Enable Mini App with `https://wishlist.chernenko.dev/app`, splash, and media previews in uk, en and pl. Leave the Menu Button at its default.
7. **R6.** Admin smoke from the profile "Open app", from `/app` and from the home inline button: create a wish with 2 photos and check it in the chat and on the share page; search a known user, give and take; switch language to Auto; send feedback.
8. **R7.** Watch the New Relic "Mini App" page for 60 minutes: 5xx, auth rejections, rate limits, upload results, proxy errors.
9. **R8.** Finish 2.0.0 as in MIGRATION_STATUS "To finish after the announcement text is approved". The paused broadcast picks up the new bullets from the manifest.

**Rollback and disable:**

1. **Fastest:** BotFather, Configure Mini App, Disable. The profile button disappears.
2. **Kill switch:** set `MINI_APP_ENABLED="false"` in the production vars and redeploy. Bot buttons disappear, `/app` shows the unavailable page, and the API answers 503. Share images keep working.
3. **Full rollback:** `pnpm exec wrangler rollback --env production`. It is safe because there are no schema changes, the old decoder ignores `via`, and photos added in the app are normal `file_id`s.
4. **Data:** no cleanup is ever needed.
5. **Old `web_app` buttons in chat history** open the shell, which renders the unavailable page.

### 2.0.0 changelog bullets

Hand-edit the existing `## 2.0.0` section of `CHANGELOG.md`, then run `pnpm releases:sync`. Do not add a changeset: that would bump the version.

```md
- [added] Лист бажань тепер має застосунок прямо в Телеграмі: відкрий його кнопкою «Відкрити застосунок» у боті, з профілю бота або командою /app. У застосунку можна все те саме, що й у чаті: додавати й редагувати бажання з фото, ділитися листом, шукати листи друзів і позначати подарунки. Чат-бот працює як раніше, а дані спільні.
    - en: Wishlist now has an app right inside Telegram: open it with the "Open app" button in the bot, from the bot's profile or with the /app command. The app does everything the chat does: add and edit wishes with photos, share your list, find friends' lists and mark gifts. The chat bot works as before, and both use the same data.
    - pl: Lista życzeń ma teraz aplikację wewnątrz Telegrama: otwórz ją przyciskiem „Otwórz aplikację” w bocie, z profilu bota lub poleceniem /app. Aplikacja potrafi to samo co czat: dodawać i edytować życzenia ze zdjęciami, udostępniać listę, szukać list znajomych i zaznaczać prezenty. Bot w czacie działa jak dotąd, a dane są wspólne.
- [added] Фото бажань тепер видно й на публічній сторінці листа бажань.
    - en: Wish photos now appear on the public wish list page too.
    - pl: Zdjęcia życzeń są teraz widoczne także na publicznej stronie listy życzeń.
- [added] Зі сторінки листа бажань можна одразу відкрити його в Телеграмі й позначити, що хочеш подарувати.
    - en: From a wish list page you can open the list in Telegram right away and mark what you want to give.
    - pl: Ze strony listy życzeń możesz od razu otworzyć ją w Telegramie i zaznaczyć, co chcesz podarować.
```

### Main risks

- **Bundle size and older WebViews.** There is a budget test, and the target is es2020/safari15.
- **Rate-limit binding support in Worker Previews** [unverified]. Covered by the allow-and-emit fallback.
- **S1 and S2 are unverified platform behavior.** Each has a defined fallback.
- **The app has two views of the same features.** Business rules live only in `src/bot/services` and `src/bot/input`, and each new feature needs a bot WP and an app WP.
- **D1 read volume.** One user query per API call and about 5 per bootstrap. Watch it on the Mini App dashboard page.

### Critical Files for Implementation

- /Users/inevix/dev/main/wishlist/src/shared/app-api.ts (new; the frozen API contract)
- /Users/inevix/dev/main/wishlist/src/api/auth/middleware.ts (new; initData validation, preview gate, rate limits), with /Users/inevix/dev/main/wishlist/src/api/auth/init-data.ts and /Users/inevix/dev/main/wishlist/src/api/auth/signing.ts
- /Users/inevix/dev/main/wishlist/src/db/repositories/wish-repository.ts (new methods for flags, images and shared-image lookup)
- /Users/inevix/dev/main/wishlist/src/web/styles/share.css (split into `fonts.css` and `gift-tag.css`, shared with `src/app/styles/app.css`)
- /Users/inevix/dev/main/wishlist/wrangler.jsonc (rate limiters, `MINI_APP_ENABLED`), together with /Users/inevix/dev/main/wishlist/.gitignore (allowlist for the new directories)

---

# Orchestrator amendments (binding, override the plan above)

1. **Production stays dark until R4.** `MINI_APP_ENABLED` is `"false"` in `env.production.vars` and `"true"` in local and previews. No production deploys from now until rollout step R4 flips it.
2. **Spike S1 passed (2026-10-02 19:24Z, preview bot):** after `deleteMessage`, the `file_id` still works for `getFile` and for re-sending. Upload = `sendPhoto` to the user's own chat, keep the largest `file_id`, `deleteMessage`. No carrier-message fallback.
3. **Images: R2 as a durable cache, Telegram stays the source of truth.**
    - New R2 buckets `wishlist-images` (production) and `wishlist-images-preview` (previews and local), binding `IMAGES`.
    - Object key = SHA-256 of the `file_id` (hex, the same `:hash` as in the URLs), with `content-type` metadata.
    - Proxy flow: authorize (signature or share checks) → R2 `get` → on miss, `getFile` + download from Telegram → R2 `put` → respond. The Cache API stays in front for hot paths.
    - App upload writes the R2 object immediately from the uploaded bytes (no Telegram download).
    - `wishes.images` keeps `file_id`s only, so the bot is unchanged. Removing a photo or a wish deletes nothing in R2 (orphans are harmless and authorization-gated). Add a follow-up note for a later cleanup job.
    - The upstream Telegram file URL is never logged or returned.
4. **Compact card grid on share pages and in the app.**
    - The grid breaks out of the 36rem text column: share page wishes sit in a wide container (max about 72rem). Desktop shows 3 columns from about 64rem, 4 from about 80rem, and up to 6 on very wide screens. Mobile shows 1 column below about 26rem and 2 above.
    - Compact card: photo on top (aspect 4:3, `object-fit: cover`, lazy, with alt text), title clamped to 2 lines, price tag chip, heart sticker for priority, a small "Open on <host>" button.
    - Description and dates fold into `<details>` ("Детальніше"), so no JS is needed.
    - The gift-tag look stays: ink border, hard shadow, notched corner, but radii and shadows are scaled down for small cards.
    - Wishes without photos show a tasteful placeholder: the logo heart on lavender, not an empty box.
    - The app uses the same card components in 1 or 2 columns.
    - Keep AAA contrast and the HTML budget (under 60 KB for 20 wishes).
    - This share-page card work is its own package, WP6b (Opus, design-sensitive), after WP2A splits the CSS and alongside WP6 (photos).
5. **hono/jsx/dom guard.** WP2B's first deliverable is a vertical slice in the smoke harness: bootstrap → list → optimistic toggle → `<input type=file>` → keyed list re-render. If controlled inputs or keyed lists misbehave, switch to Preact (`jsxImportSource: preact`) before WP7 and WP8 start. Decide once.
6. **Spike S2 needs a real device** (`requestContact` posting to the chat). It is bundled into the user's device QA on @InevixTestBot.
7. **Commit hygiene.** WP0 is committed first, after `git check-ignore -v` on a file in each of `src/app`, `src/api`, `src/shared` and `public/app`. Contracts freeze when WP1A is committed. Before every integration commit the orchestrator runs `app:build` and `css:build`.
8. **Tiering:**
    - Opus: WP1A, WP2B, WP6b, WP7, WP12 final review.
    - Sonnet: WP0, WP1B, WP2A, WP3, WP4, WP5, WP6, WP8, WP9, WP10, WP11, security audit.
