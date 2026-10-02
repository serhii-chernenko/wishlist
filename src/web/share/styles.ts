export const SHARE_PAGE_STYLES = `
:root{color-scheme:light dark;--bg:#fbf7f6;--surface:#fff;--surface-muted:#f5eeee;--text:#231a1c;--muted:#6e5d61;--border:#eadfe0;--accent:#e11d48;--accent-text:#fff;--accent-soft:#ffe4ea;--accent-soft-text:#9f1239;--callout:#fff7e6;--callout-border:#f4d58a;--radius:14px}
@media (prefers-color-scheme:dark){:root{--bg:#161113;--surface:#211a1d;--surface-muted:#2b2226;--text:#f4eceb;--muted:#b3a1a5;--border:#382c31;--accent:#fb7185;--accent-text:#2a0a12;--accent-soft:#4a1a26;--accent-soft-text:#fecdd6;--callout:#2d2616;--callout-border:#5b4a1d}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;overflow-wrap:anywhere}
a{color:var(--accent)}
a:focus-visible{outline:3px solid var(--accent);outline-offset:2px;border-radius:4px}
.page{max-width:720px;margin:0 auto;padding:20px 16px 40px}
.switcher{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:0 0 20px;font-size:14px;color:var(--muted)}
.switcher ul{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.switcher a,.switcher span[aria-current]{display:inline-block;padding:4px 12px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--text);text-decoration:none}
.switcher span[aria-current]{background:var(--accent);border-color:var(--accent);color:var(--accent-text);font-weight:600}
.switcher a:hover{border-color:var(--accent)}
.hero{margin:0 0 24px}
.hero h1{margin:0 0 8px;font-size:clamp(1.6rem,6vw,2.2rem);line-height:1.2}
.facts{display:flex;flex-wrap:wrap;gap:4px 16px;margin:0;padding:0;list-style:none;color:var(--muted);font-size:15px}
.callout{margin:0 0 24px;padding:16px;border:1px solid var(--callout-border);border-radius:var(--radius);background:var(--callout)}
.callout h2{margin:0 0 6px;font-size:1.05rem}
.callout p{margin:0 0 10px}
.callout p:last-child{margin:0}
.callout .hint{color:var(--muted);font-size:14px}
.wishes{display:grid;gap:14px;margin:0;padding:0;list-style:none}
.wish{padding:16px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)}
.wish.is-priority{border-color:var(--accent)}
.wish h2{margin:0 0 8px;font-size:1.15rem;line-height:1.3}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}
.chip{display:inline-block;padding:2px 10px;border-radius:999px;background:var(--surface-muted);font-size:14px}
.chip.priority{background:var(--accent-soft);color:var(--accent-soft-text);font-weight:600}
.chip.priority::before{content:"\\2764\\FE0F";margin-right:4px;font-weight:400}
.description{margin:0 0 12px}
.button{display:inline-block;max-width:100%;padding:9px 16px;border-radius:10px;background:var(--accent);color:var(--accent-text);font-weight:600;text-decoration:none;text-align:center}
.button:hover{filter:brightness(1.08)}
.dates{margin:12px 0 0;color:var(--muted);font-size:13px}
.notice{margin:16px 0 0;padding:12px 14px;border-radius:var(--radius);background:var(--surface-muted);color:var(--muted);font-size:15px}
.empty{padding:28px 16px;border:1px dashed var(--border);border-radius:var(--radius);text-align:center;color:var(--muted)}
.footer{margin-top:36px;padding-top:24px;border-top:1px solid var(--border);display:grid;gap:16px;justify-items:start}
.footer h2{margin:0 0 8px;font-size:.95rem;color:var(--muted);font-weight:600}
.support{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.support a{display:inline-block;padding:6px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);text-decoration:none;font-size:15px}
.support a:hover{border-color:var(--accent)}
.source{font-size:14px;color:var(--muted)}
.message{padding:48px 0 16px}
.message h1{margin:0 0 12px;font-size:1.7rem;line-height:1.25}
.message p{margin:0 0 20px;color:var(--muted)}
@media (min-width:640px){.page{padding-top:32px}.wish{padding:20px}}
`.trim();
