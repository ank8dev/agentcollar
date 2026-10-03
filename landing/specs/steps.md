# Section 2 — How it works (the leash)

Read `specs/README.md` first. Section band: `--top: 1060; --h: 2140` (already in `index.html`).
Keep the existing visually-hidden `<h2 id="steps-title">How it works</h2>`.

## Layout (Figma page px)
A vertical leash runs down the middle and ends with the collar + AC tag. Three sage blobs alternate left / right / left. Each blob holds a step's text and drawing.

Z-order (back → front): blobs → marker fills → step drawings → text → leash → stars.

### Blobs (fill `var(--sage)`, inline SVG, `aria-hidden`)
Each path is in its own box coordinates; place the `<svg class="pos">` at `--x/--y`, `viewBox="0 0 W H"`, `width = W`.

**Blob 1** — `--x: -222; --y: 1068`, box 949×888
```
M58 469 C61 433 56 402 54 363 C52 325 38 277 46 237 C53 196 73 153 98 118 C123 84 159 51 196 32 C234 12 281 -3 324 0 C366 3 413 28 449 49 C486 69 513 105 542 125 C571 145 594 156 625 168 C656 180 682 188 726 197 C770 205 859 195 891 220 C923 246 908 307 918 350 C927 393 944 433 949 477 C953 520 961 571 945 611 C929 650 885 683 853 712 C820 740 785 764 750 782 C715 800 678 810 643 821 C608 831 575 835 541 842 C508 849 477 859 442 865 C407 872 373 877 332 881 C292 885 244 895 200 888 C157 882 103 869 70 842 C36 814 6 768 0 724 C-6 680 27 621 37 578 C46 535 55 505 58 469 Z
```
**Blob 2** — `--x: 849; --y: 1512`, box 932×852 (sticks out past the right edge; `.page` clips it)
```
M0 399 C-2 359 4 316 14 276 C24 237 38 196 59 160 C79 124 104 87 135 61 C166 36 207 15 246 5 C284 -5 329 -1 367 0 C405 1 439 6 474 9 C510 12 542 15 578 18 C614 21 652 21 691 29 C730 37 780 44 813 67 C846 90 874 129 891 165 C908 202 910 248 916 288 C922 328 925 367 927 407 C930 448 938 490 932 531 C926 572 917 620 892 651 C867 683 820 703 783 721 C747 739 707 746 672 759 C638 773 608 787 574 802 C540 817 505 842 467 851 C429 859 383 863 346 852 C310 841 276 810 245 786 C215 762 189 734 163 706 C136 679 110 652 86 621 C63 589 38 556 24 519 C10 482 2 439 0 399 Z
```
**Blob 3** — `--x: -115; --y: 2032`, box 968×818
```
M0 398 C-2 358 -3 316 5 277 C13 238 29 199 49 163 C68 128 90 88 122 64 C154 41 200 29 239 22 C278 16 320 24 356 25 C393 25 422 29 457 25 C492 21 527 3 565 0 C603 -3 653 -9 686 7 C720 22 745 62 768 93 C790 124 801 161 822 193 C843 225 870 252 894 288 C918 323 969 367 968 406 C967 445 911 486 888 522 C864 558 847 588 827 622 C807 655 795 696 768 721 C741 747 699 758 664 774 C630 789 596 808 561 815 C525 822 487 820 450 818 C414 816 377 814 342 806 C307 797 273 781 239 765 C206 750 168 735 138 711 C109 688 85 655 64 622 C43 589 25 552 15 515 C4 478 2 437 0 398 Z
```

### Step text (always `color: var(--ink)` — it sits on sage, 7.9:1)
Use an ordered list (`<ol>`, `<li>` per step) for semantics; each step = `<h3>` title + `<p>` body.
- Title: Intel One Mono **bold italic 56 px**, line-height 74 px. Note: no space after the number: `1.Give a task.`
- Body: regular **48 px**, line-height 66 px.
- Title and body stack directly (no gap). Width set in `ch` of the body font so line breaks match Figma.

| Step | Block left/right | Block top (y) | Align | Width | Lines in Figma |
|---|---|---|---|---|---|
| 1 | left x 97 | 1208 | left | 18ch | `1.Give a task.` / `Tell your agent` / `what to do before` / `you go to bed.` |
| 2 | **right edge x 1464** | 1589 | right | 22ch | `2.Approve access.` / `Your agent asks only` / `for what it needs. You` / `approve with one tap.` |
| 3 | left x 60 | 2083 | left | 22ch | `3.Wake up to` / `results.` (title wraps) / `Everything is ready in` / `the morning. Nothing` / `gets sent without your` / `"yes".` |

Exact copy:
1. **1.Give a task.** Tell your agent what to do before you go to bed.
2. **2.Approve access.** Your agent asks only for what it needs. You approve with one tap.
3. **3.Wake up to results.** Everything is ready in the morning. Nothing gets sent without your "yes".

### Step drawings (PNG 606×606, both inks, `alt` = short description)
| Step | file | --x | --y | --w |
|---|---|---|---|---|
| 1 | `agentcollar-step-1-task-*-ink.png` | 125 | 1487 | 460 |
| 2 | `agentcollar-step-2-approve-*-ink.png` | 986 | 1882 | 460 |
| 3 | `agentcollar-step-3-results-*-ink.png` | 87 | 2412 | 460 |

### Colored marker fills behind each drawing
Wrap each drawing like the hero (`.hero__art` pattern: a box with an SVG `viewBox="0 0 606 606"` of zigzag fills under the PNG). Boxes below are in the drawing's own 606×606 pixel space: `x y w h color`.
- Step 1: speech bubble `197 90 193 101 var(--rose)`; the person (hair/back/arm) `49 347 153 216 #a56d50`, plus `175 477 123 93 #a56d50` and `101 499 73 101 #a56d50` (brown crayon scribble over the person's body).
- Step 2: the left list panel `94 84 158 258 #7d95aa` (a darker mist blue); approve button `160 393 253 96 var(--rose)`.
- Step 3: the sun `208 57 82 107 #cca756` (ochre/sand, small scribble inside the sun); Send button area `212 429 218 92 var(--rose)`.
Zigzag stroke widths ≈ 26–30 px (in 606 space), round caps/joins, `filter="url(#crayon)"`. Keep them slightly messy and a bit outside the outlines, like a marker.

### Leash (on top of blobs)
`agentcollar-leash-{dark,light}-ink.png` — `--x: 455; --y: 1278; --w: 524` (the collar + AC tag at the bottom ends around y 3175). `alt=""` (decorative; the steps carry the meaning).

### Stars (`.star`, default color)
`--x 969 --y 1250 --w 69` · `--x 1336 --y 2678 --w 75` · `--x 1150 --y 2961 --w 74` · `--x 188 --y 3031 --w 75` — give each a small random `--r` (±12deg).

## Motion (optional but wanted)
The leash "draws itself" while scrolling: reveal it top→bottom with a `clip-path: inset(0 0 X% 0)` tween scrubbed by ScrollTrigger over the section. Blobs may fade/slide in slightly as they enter. Reduced motion: everything fully visible, no tweens.

## Mobile (375 px)
The page scales proportionally (`--u`), so the layout stays the same. Body text becomes ~12 px — enforce a minimum: `font-size: max(calc(48 * var(--u)), 12px)` (title `max(calc(56 * var(--u)), 13px)`). If the minimum makes text overflow its blob at 375 px, report it in the PR with a screenshot rather than redesigning.
