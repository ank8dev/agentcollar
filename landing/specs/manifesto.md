# Section 3 — Manifesto

Read `specs/README.md` first. Section band: `--top: 3200; --h: 800`.

## Raspberry blob
Inline SVG, `aria-hidden`, `--x: -87; --y: 3201`, box 1653×791 (wider than the frame; `.page` clips it).
```
M0 382 C-13 316 -11 228 30 174 C70 120 173 83 241 58 C310 32 383 28 441 19 C499 11 544 10 588 7 C632 3 667 1 703 0 C740 -1 773 0 807 1 C842 2 875 2 911 4 C947 7 983 10 1024 16 C1065 22 1108 28 1158 41 C1208 54 1266 67 1325 94 C1384 122 1459 155 1514 205 C1568 256 1648 331 1653 396 C1659 461 1600 544 1548 595 C1495 646 1401 676 1338 703 C1274 730 1217 743 1165 756 C1113 769 1069 775 1026 781 C983 786 945 788 908 789 C870 791 836 792 801 791 C765 790 731 789 694 786 C657 783 620 780 577 774 C535 767 489 762 439 747 C389 733 332 717 277 687 C222 657 155 620 109 569 C62 518 13 448 0 382 Z
```
**Contrast fix:** paper text on the brand raspberry `#BD4F6C` is only 4.23:1 (rule is 4.5). Fill the blob with `#B44B67` (4.6:1, visually the same). Add it as a section-local variable, e.g. `--raspberry-text-safe: #b44b67`, with a comment explaining why.

## Text
Paper-colored (`var(--paper)` in BOTH themes — it is on the blob), centered on x = 756 (frame center), Intel One Mono **regular 75 px**, line-height **105 px**. First line's box top at **y 3280** (line centers at 3332, 3437, 3542, 3647, 3752).

```
Agents are coming.
They'll read your mail.
They'll run your business.
They'll work while you sleep.
Just not without a collar.      ← bold italic, on a highlight band
```
Use one `<p>` (or `<blockquote>`) with `<br>`s; the last line in `<em><strong>`.
Typographic apostrophes are fine (’) but keep the monospace look.

## Highlight under the last line
A hand-drawn marker band behind the lower part of "Just not without a collar.":
- spans x ≈ 216 → 1251, y **3727 → 3792** (65 px tall, covers roughly the lower 60% of the letters), slightly wobbly ends (use `filter="url(#crayon)"` on an SVG rect/path, or a zigzag like the hero fills).
- Figma color ≈ `#A86848` (sand over raspberry) — that gives only 4.0:1 with paper text. Use **`#985C40`** (4.83:1) so the text passes.
- The hero headline's marker was removed by the owner; this one stays unless the owner says otherwise — mention it in the PR so they can decide.

## Motion (optional)
Lines fade/slide up one after another as the blob enters (ScrollTrigger, `stagger`). The highlight band can "draw" left→right (`clip-path`/`scaleX`) after the last line appears. Reduced motion: final state.

## Dark theme
The blob and its text are identical in both themes. Only the page background around it changes.

## Mobile
Proportional scaling makes text ~19 px at 375 px; that is fine. Make sure nothing overflows the blob.
