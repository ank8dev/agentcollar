# Section 4 — Trust

Read `specs/README.md` first. Band: `--top: 4000; --h: 1200`. The `<section>` already has `aria-labelledby="trust-title"` — give your heading `id="trust-title"`.

## Heading (theme text color: `var(--text)`)
Centered on x = 756, Intel One Mono **500, 60 px**, line-height **87 px**, block top **y 4060**, max width **36ch** (gives the Figma line breaks):
```
Your agent never sees your password.
Every token is short-lived, limited
to one task, and you can revoke it
anytime.
```
Markup: `<h2 id="trust-title">Your agent never sees your password.</h2>` followed by `<p>Every token is short-lived, limited to one task, and you can revoke it anytime.</p>` with identical styling (the first sentence is exactly the first line).

## Cards
Four cards, each **590 × 655**, corner radius ≈ 56, no border/shadow. Text is centered at the top, a big empty area below is reserved for a hand-drawn icon (icons not delivered yet → placeholder).

| # | color | title | body | icon placeholder |
|---|---|---|---|---|
| 1 | `var(--sage)` | Short-lived. | Tokens expire in minutes. | hourglass |
| 2 | `var(--rose)` | One task only. | Drafts can't become sends. | target |
| 3 | `var(--mist-light)` (#C9D6D9) | Revoke anytime. | One tap stops everything. | open hand |
| 4 | `var(--sand)` | Fully logged. | Risky actions wait for your "yes". | scroll |

- Title: regular **64 px**, center of first line at **81 px** below the card top.
- Body: regular **40 px**, line-height **54 px**, width **18ch** (gives "Tokens expire in / minutes."), first line center **151 px** below the card top.
- **Text color: `var(--ink)`** (Figma shows white text — that fails contrast; ink wins per the brief). "Revoke anytime." nearly fills the card width; keep it on one line.
- Icon placeholder: a dashed ink outline box ≈ 300 × 300, centered horizontally, top ≈ 280 px below the card top, `aria-hidden="true"`, with `data-icon="hourglass"` etc. so real icons can drop in later.
- Use a list: `<ul class="trust-cards">` + `<li>` per card, `<h3>` title + `<p>` body.

## Two layouts of the cards (page px, all cards top y **4473**)
**Stacked deck** (start): x = **86, 246, 428, 615** (card 1 at the back, card 4 on top — each later card overlaps the previous).
**Spread row** (end): x = **87, 732, 1369, 2025**. Note the row is wider than the 1512 frame (cards 3–4 run off the right edge in Figma).

## Animation (desktop, ≥ 768 px)
Pin the section with ScrollTrigger and scrub:
1. deck → spread (cards slide to their row positions; a slight fan rotation mid-way, e.g. ±4deg, settling to 0, feels good);
2. keep scrolling: the whole row slides left so that card 4 ends fully visible (right edge at ≈ 1512 − 87), then unpin.
Reduced motion: no pin, no tweens — show the cards as a static row that wraps 2×2 (or the carousel below).

## Mobile (< 768 px) — the owner wants to try BOTH and choose
Implement both, switchable by an attribute on the section so the owner can compare: `data-mobile-cards="fan"` (default) or `data-mobile-cards="carousel"`.
- `fan`: same deck → spread animation as desktop (proportionally scaled).
- `carousel`: horizontal swipe row with CSS `scroll-snap-type: x mandatory`, each card `scroll-snap-align: center`, cards ≈ 80vw wide, overflow-x auto, no JS needed. Keep it keyboard accessible (`tabindex="0"` on the scroller + `aria-label`).
Explain in the PR how to switch (and add a tiny dev-only toggle if helpful, e.g. `?cards=carousel` read in `trust.js`).

## Dark theme
Cards keep their colors and ink text. Heading uses `var(--text)` (paper in dark). Check contrast.
