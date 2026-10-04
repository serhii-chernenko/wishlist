# Share page redesign spec ("gift tag" direction)

Subject: a person's wish list, opened by friends/family from a Telegram link, mostly on phones. Job: scan wishes fast — what, how much, where to buy, or how to send money.
Visual source: the bot avatar (scratchpad/assets/bot-avatar-640.jpg): flat fills, chunky pure-black outlines, sticker/gift-tag look.

## Tokens

- --paper #F1E3FB lavender page background (light)
- --ink #000000 outlines + text (pure black, not near-black)
- --tag #FFFFFF tag surfaces
- --heart #F57AA6 primary CTA fill (black text on it); the high priority badge shares this pink
- --box #2AABE2 money/payments envelope fill (black text on it)
- --heart-ink #7A1040 links on light surfaces (AAA)
  Dark (prefers-color-scheme): page #130C19 (OKLCH L 0.17), tag #2A1E33 (L 0.26, a clearly raised surface), gifted band = the page token again, so it cuts across the card as a darker strip like the light theme, ink/outline #F1E3FB (lavender outlines instead of black), text #FBF4FF; heart/box fills keep black text. All text pairs ≥ 7:1 (keep the existing contrast test, update values).
  Borders: 2.5px solid ink on interactive/tag elements; hard offset shadow `3px 3px 0 var(--ink)` (never blurred, never grey). Radius: tags 14px except the notched corner; buttons 999px? NO — buttons radius 10px; chips 999px. Radii differ by hierarchy (hero tag 22px, wish tags 14px, chips full).

## Type

- Display: "Unbounded Variable" (self-hosted woff2, subsets cyrillic, cyrillic-ext, latin, latin-ext from node_modules/@fontsource-variable/unbounded/files → public/fonts/), weights 500–800. Used for: page title, wish titles, prices, CTA label.
- Text: "Commissioner Variable" (cyrillic, latin, latin-ext) 400/500/600 for body, meta, buttons.
- @font-face with font-display: swap and unicode-range per subset (copy the ranges from the fontsource CSS files). Preload the cyrillic Unbounded file only.
- Scale (rem, ~1.25 ratio): title clamp(1.9rem, 6vw, 2.75rem)/1.05, wish title 1.2rem/1.25 Unbounded 650, price 1rem Unbounded 700, body 1rem/1.55 Commissioner, meta 0.875rem/1.4. Line length ≤ 65ch. Sentence case everywhere. NO all-caps labels, NO eyebrow labels, NO "·" joined meta strings, NO "→" arrows.

## Layout (mobile-first, single column max-width 36rem, left-aligned, 16–20px gutters)

```
                                  [UA][EN][PL]      ← segmented control, top-right, outlined
 ╭─────────────────────────────○╮                   ← HERO gift tag (the one bold element):
 │ Лист бажань від               │                    white tag, 3px border, 5px offset shadow,
 │ Serhii Chernenko              │                    rotated -1.5deg (0 when prefers-reduced-motion? rotation is static; keep),
 │ 3 бажання, оновлено 28 грудня │                    punched hole (circle with ink border) near the right end
 ╰───────────────────────────────╯                    and a "string" (a curved 2px ink line via an inline SVG or pseudo-element) leaving it.
                                                    The name on its own line in Unbounded 800; "Лист бажань від" in Unbounded 500 smaller.
                                                    Meta as one sentence (count + "оновлено" date), Commissioner.
                                                    @username line only if allowed.
 ┌ money envelope (box blue, 2.5px border, flap drawn with a CSS triangle/border on top) ┐
 │ "Можна подарувати гроші" (heading, Commissioner 600) + owner's payments text (pre-line)│
 └──────────────────────────────────────────────────────────────────────────────────────┘
 ♥┌────────────────────────────────┐  wish tags: white, 2.5px border, 3px shadow, NOT rotated, notched top-right corner
  │ Клавіатура NuPhy Halo75 V2      │  (clip-path or an ink-bordered corner cutout like a luggage tag).
  │ [6 400 ₴]  price tag chip        │  Price = small tag chip: heart pink fill? NO — keep price on white with ink border and a tiny hole dot (tag motif), Unbounded 700.
  │ description (pre-line)          │  Priority wishes carry a text badge (low, medium, high) with a signal icon under the photo; wishes without priority have none. No heart on cards: a heart reads as a favorite.
  │ [ Відкрити на nuphy.com ]       │  Link button: ink fill, white text (dark: lavender fill, black text), 10px radius, press = translate(2px,2px) + shadow 0 (only motion on page; disable transition under prefers-reduced-motion).
  │ Додано 7 червня 2024 (оновлено …)│  Dates one short sentence, meta size.
  └────────────────────────────────┘
 footer (no card around it): big heart-pink CTA button "Створити свій лист бажань" (Unbounded 600, ink border + shadow);
 below: "Підтримати автора" small heading + outlined chips Monobank / Ko-fi / PayPal / Revolut (no emoji clutter, text only);
 last: "Відкритий код на GitHub" plain underlined link.
```

Empty / 404 / 410 pages reuse the hero tag with a clear one-line direction (e.g. 404: "Цього листа бажань не існує або посилання застаріло" + CTA to the bot). Copy: plain, active voice, no apologies.

## Principles

1. One bold thing: the hero gift tag with hole + string. Everything else quiet and disciplined.
2. Outlines and hard shadows come from the avatar's sticker art — never soft grey shadows, never gradients.
3. Structure = information: the priority badge appears only on low, medium and high wishes and is the single priority signal; the price chip only when price > 0; dates only as needed.
4. Zero JS, semantic HTML (header, main, ul/li of articles, footer), visible focus ring (3px heart-pink outline + 2px offset), keyboard friendly, reduced motion respected.
5. Photo states: a wish with no photo and a wish whose imported photo is still loading both show the theme-aware gift logo placeholder (the `--photo-placeholder-*` tokens), never a heart. The loading state adds an opacity pulse on the logo (no gradient sweep, switched off under `prefers-reduced-motion`) and a screen-reader-only "photo is loading" note. The share page draws the logo once in a hidden sprite and every card references it, which keeps the 20-wish page inside the budget.
6. Budget: HTML < 60 KB for 20 wishes; fonts self-hosted woff2, subset files only; CSP: font-src 'self', style-src 'self', img-src 'self' data: only if needed for SVG (prefer inline SVG elements, which need no img-src).
