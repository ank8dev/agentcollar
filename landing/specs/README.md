# Landing build specs — shared rules

The page is a 1:1 build of a Figma frame **1512 px wide, 6742 px tall** (light theme).
The original screenshots are NOT in this repo. Every number you need is in these specs.
All coordinates are **Figma page pixels** (x from the frame's left edge, y from the page top).

## Files you own
Each section has its own files. Only edit your own, plus your `<section>` block in `index.html`:

| Section | HTML block | CSS | JS |
|---|---|---|---|
| How it works | `<section class="steps stage">` | `sections/steps.css` | `sections/steps.js` |
| Manifesto | `<section class="manifesto stage">` | `sections/manifesto.css` | `sections/manifesto.js` |
| Trust | `<section class="trust stage">` | `sections/trust.css` | `sections/trust.js` |
| Footer | `<footer class="site-footer stage">` | `sections/footer.css` | `sections/footer.js` |

Do not edit `styles.css`, `main.js`, the hero or other sections. If you truly need a shared change, describe it in your PR instead.

## The positioning system (already in `styles.css`)
- `--u` = one Figma pixel (`100cqw / 1512`). The whole page scales with the viewport; on a 375 px phone `--u` ≈ 0.25 px. Use `calc(N * var(--u))` for every size (fonts, radii, offsets).
- A section is `class="stage"` with `style="--top: <page y where it starts>; --h: <height>"`.
- A child with `class="pos" style="--x: X; --y: Y; --w: W; --r: 5deg"` is absolutely placed at Figma page coordinates (`--top` is subtracted for you). `--r` (rotation) is optional.
- Children may overflow their section (blobs overlap neighbours). `.page` clips horizontally.

Section bands: hero 0–1060 · steps 1060–3200 · manifesto 3200–4000 · trust 4000–5200 · footer 5200–6742.

## Colors (CSS variables in `styles.css`)
`--ink #04080F` · `--paper #F0F6E7` · `--sage #90AA8B` · `--raspberry #BD4F6C` · `--rose #DFBBB1` · `--mist #A9BCC8` · `--mist-light #C9D6D9` · `--sand #F2D7A6` · `--star #D1A392` · `--night-edge #0E1520`.
Theme roles: `--bg`, `--text` (swap in dark theme). Use variables only, never raw hex in section CSS (except a one-off detail color noted in a spec).

## Contrast rule (hard requirement)
All text ≥ 4.5:1 against what is behind it, in both themes. On sage/rose/mist/sand use **ink** text. Check dark theme too.

## Light / dark theme
- Dark theme = `prefers-color-scheme: dark` unless `<html data-theme="light">`, or `<html data-theme="dark">`. Copy the selector pattern used in `styles.css`.
- Drawings: put both versions and use classes `ink-on-light` (black-ink `-dark-ink.png`) and `ink-on-dark` (white-ink `-light-ink.png`); CSS already shows the right one.
- Colored blobs/cards keep the same colors in both themes; text on them stays ink.

## Assets (all under `brand/`, reachable as `./brand/...` from `landing/`)
- `brand/logo/agentcollar-{logo,mark,tag}-{black,white}.{svg,png}` (1024×1024 canvases)
- `brand/pictures/agentcollar-step-{1-task,2-approve,3-results}-{dark,light}-ink.png` (606×606)
- `brand/pictures/agentcollar-leash-{dark,light}-ink.png` (398×1482)
- `brand/pictures/agentcollar-star.png` (688×663, trimmed) — use the existing `.star` class: `<span class="pos star" style="--x;--y;--w;--r" aria-hidden="true">`; recolor with `--star-color: var(--sage)`.
- `brand/pictures/agentcollar-earth.png` (905×934, trimmed, transparent)
- Missing (placeholders): 4 card icons — hourglass, target, open hand, scroll.

## Typography
Font **Intel One Mono** (Google Fonts, already loaded: 400, 500, 700, italic 400/700). Monospace advance ≈ 0.6 em. Use `ch` widths to force the same line breaks as Figma.

## Motion
GSAP + ScrollTrigger. `main.js` calls your `init({ gsap, ScrollTrigger, reducedMotion })`. With `reducedMotion === true`: no animation, show the final state. Never add other libraries.

## Accessibility
Decorative images `alt=""` / `aria-hidden="true"`; meaningful images get alt text. Real links are `<a>`, keyboard-focusable, visible `:focus-visible`.

## Visual style
Hand-drawn, crayon/marker, slightly messy on purpose. The SVG filter `url(#crayon)` (defined at the top of `index.html`) wobbles edges of any SVG shape; use it for hand-drawn fills.
Colored "marker fills" behind drawings: SVG zigzag paths (`stroke-linecap/linejoin: round`, `filter="url(#crayon)"`) placed BEHIND the PNG — see the hero (`.hero__fills`) for the exact technique.

## Definition of done for your PR
1. `cd landing && npm ci && npm run build` passes.
2. Screenshot at 1512 px and 375 px wide, light and dark (headless Chrome is fine), and check against your spec numbers.
3. Reduced motion shows the final state.
4. PR description: what you built, screenshots, any spec number you had to guess or change.
