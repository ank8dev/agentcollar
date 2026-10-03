# Section 5 — Footer "above the Earth"

Read `specs/README.md` first. Band: `<footer class="site-footer stage" style="--top: 5200; --h: 1542">` (page ends at 6742).

## Night sky shape
Dark `var(--ink)` area with a domed/wavy top edge. SVG `aria-hidden`, placed at `--x: -100; --y: 5200`, `viewBox="-100 0 1640 1542"`, width 1640 (`.page` clips the overflow). Path (footer-local y, 0 = page y 5200):
```
M-100 1542 L-100 186 L-60 152 L-20 129 L20 112 L60 99 L100 88 L140 79 L180 73 L220 67 L260 62 L300 58 L340 55 L380 51 L420 46 L460 42 L500 39 L540 35 L580 30 L620 26 L660 21 L700 17 L740 13 L780 8 L820 5 L860 2 L900 2 L940 2 L980 2 L1020 5 L1060 8 L1100 13 L1140 19 L1180 27 L1220 35 L1260 46 L1300 57 L1340 71 L1380 86 L1420 104 L1460 127 L1500 159 L1540 207 L1540 1542 Z
```
These are measured points every 40 px; smooth them into curves if you like and add a slightly hand-drawn wobble (`filter="url(#crayon)"` on the edge is fine).
**Dark theme:** the page is ink too, so the footer must stand apart: fill the footer shape with `var(--night-edge)` (#0E1520) in dark theme. Light theme: `var(--ink)`.
Everything inside the footer is on a dark background in BOTH themes → use the white/light-ink assets and paper text always.

## Elements (page px)
- **AC tag** (always `agentcollar-tag-white.png`, `alt=""`): `--x: 559; --y: 5375; --w: 371` (visible tag ≈ x 646–843, y 5409–5712; the PNG has transparent margins).
- **Stars** (`.star`, some slowly twinkling — opacity/scale loop, 3–6 s, random delays; none with reduced motion):
  `--x 441 --y 5520 --w 73` · `--x 1162 --y 5482 --w 66` · `--x 960 --y 5731 --w 37` · `--x 136 --y 5809 --w 39` · `--x 1328 --y 6043 --w 55`.
- **Earth** (`agentcollar-earth.png`, 905×934, `alt="The Earth"` or decorative `alt=""`): the visible disc is a circle with center **(772, 6928)**, radius **882** → only the top cap shows above the page bottom (disc top at y 6045). Size/position the image so its disc matches that circle (start with `--x: -167; --y: 5987; --w: 1878` and calibrate — the PNG has a soft glow around the disc). The image's thin cyan/yellow fringe at the disc edge is in the asset; leave it.
  Motion: very slow parallax (Earth moves up a little slower than the scroll) and/or a very slow rotation feel (e.g. `rotate` 0→4deg over the footer scroll). Airy, calm.

## Star → button CTA (the main interaction)
Must end as a real link: `<a class="footer-cta" href="https://github.com/ank8dev/agentcollar">Star on GitHub</a>`, keyboard-focusable, clear `:hover` and `:focus-visible` states.

**Start state** (footer just entering the viewport): a small star sitting on the Earth's top — star box `--x 572; --y 5801; --w 343`. The label "Star on GitHub" is **curved along the Earth's horizon** (SVG `<textPath>` on an arc concentric with the Earth circle), italic, paper color, ~60 px, spanning roughly x 482 → 1040 around y 5990–6060.

**End state** (scrolled further): the star has **flown up** under the tag — star box `--x 489; --y 5537; --w 512` — and the label is **straight**, centered on x ≈ 745 at y ≈ 5802, italic ~72 px.

**Contrast requirement:** in Figma the end-state label is paper-colored over the rose star (≈1.9:1) — that fails. Make the end state a clear button: label in **ink** (`var(--ink)`, ≈ 8:1 on the star color `#D1A392`), sized to sit inside the star body (or on a hand-drawn rose pill behind the text). Keep the look close to the design and explain your choice in the PR.

Animation: one ScrollTrigger timeline scrubbed over the footer: star translates/scales from start → end box; curved label morphs to straight (simplest: cross-fade the `<textPath>` version out and the straight label in while it moves). Reduced motion: show the end state only (button visible, no curved text).

## Footer line
Small text at the bottom: `© 2026 AgentCollar · GitHub` (GitHub = link to the repo). Place it at the bottom center over the Earth with a solid ink backing strip or text-shadow so it passes 4.5:1, or just below the Earth if that reads better. Min size 12 px.

## Mobile
Proportional scaling. Make sure the CTA tap target is at least 44×44 px at 375 px wide.
