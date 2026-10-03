# AgentCollar — landing page brief (for Claude Code)

One-page landing site for AgentCollar: a secure gateway that gives AI agents short-lived, task-scoped access instead of passwords.
The design is finished in Figma. Your job: build it as faithfully as possible, in small steps, and explain each step to me (I am learning — no black boxes).

## Source of truth: the screenshots
`design-reference/reference-1-full-page.jpg` and `design-reference/reference-2-cards-spread.jpg` are the exact design.
- Open and look at them **before every step** and compare your result with them.
- If this brief and the screenshots disagree about how something looks, **the screenshots win** (except the contrast rule below).
- Reference 1 = whole page, cards still stacked. Reference 2 = same page after scrolling, cards spread out.
- `design-reference/` is for you only. Do not ship it with the site.

## How to work with me
- Before coding, read this brief, look at both screenshots, and look at every file in `pictures/` and `brand/`.
- Work in small steps. After each step, stop, show what changed, and explain why.
- Prefer simple solutions. Ask me before adding a library or a framework I did not list.
- If something in the design is unclear, ask. Do not guess.

## Tech
- Static site: `index.html` + `styles.css` + `main.ts` (or `main.js`). Vite as the dev server is fine.
- Scroll animations: GSAP + ScrollTrigger.
- Hosting: **GitHub Pages**. Create a public repo `agentcollar` on my GitHub account (`ank8dev`), push the code, and publish it at `https://ank8dev.github.io/agentcollar/`.
  - Ask me before creating the repo and before the first push.
  - Set Vite `base: '/agentcollar/'` so images and scripts load on that path.
  - Deploy with a GitHub Actions workflow (build → GitHub Pages), so every push to `main` updates the site.
  - Add a short `README.md` with the logo, the tagline and the site link.
  - Do not commit `design-reference/` or `node_modules/` (add them to `.gitignore`).
- Must work on mobile first (the design is a narrow column), then desktop.
- Respect `prefers-reduced-motion`: no flying/fanning animations, show the final state.

## Brand
| Token | Hex | Use |
|---|---|---|
| ink | `#04080F` | text on light, dark sections |
| paper | `#F0F6E7` | page background, text on dark |
| sage (accent) | `#90AA8B` | step blobs, card 1, "allowed" |
| raspberry | `#BD4F6C` | manifesto blob, "denied" |
| rose | `#DFBBB1` | stars, card 2 |
| mist blue | `#A9BCC8` / `#C9D6D9` | card 3 |
| sand | `#F2D7A6` | marker highlights, card 4 |

- Text on any colored card or blob must pass WCAG contrast 4.5:1. On sage/rose/mist/sand use **ink** text, not white.
- Font: **Intel One Mono** (free, SIL Open Font License) for all text — regular, bold and italic, as in the screenshots. Load it from Google Fonts if it is there; otherwise self-host the files from the official repo `github.com/intel/intel-one-mono` (WOFF2) with `font-display: swap`. Fallback: `ui-monospace, monospace`.
- Style: hand-drawn, crayon/marker, slightly messy on purpose. Do NOT clean up the marker strokes.

## Light and dark theme
The screenshots show the **light** theme. Also build a **dark** theme.
- Default: follow the system setting (`prefers-color-scheme`). Plus a small toggle in the header (sun/moon, hand-drawn style if possible) that overrides it. Remember the choice in `localStorage`.
- Use CSS variables for all colors, so the theme switch only swaps variables.
- Dark theme: page background `ink #04080F`, text `paper #F0F6E7`. Swap every illustration to its `-light-ink` version and the logos to `-white`.
- Keep the colored blobs and cards (sage, raspberry, rose, mist, sand) the same in both themes. Text on them stays `ink`.
- The footer is already dark. In dark theme, separate it from the page with its wavy edge in a slightly lighter dark (e.g. `#0E1520`) so it does not disappear.
- Check contrast again in dark theme.

## Assets
All illustrations are in `pictures/` (transparent PNG, two inks: `-dark-ink` for light bg, `-light-ink` for dark bg).
Logos are in `brand/logo/` (SVG + PNG).
The marker highlights and colored details I added in Figma will be exported by me as separate PNG files into `pictures/` (Figma connection has view-only access, so export is manual).
Missing (I will provide later): 4 hand-drawn card icons — hourglass, target, open hand, scroll. Leave a placeholder box for each.

## Page structure (top to bottom)

### 0. Header
- Left: AC mark (`brand/logo/agentcollar-mark-black.svg`). Right: wordmark "AgentCollar" (italic, monospace).

### 1. Hero
- Small collar logo above the headline.
- Headline, two lines, on a sand marker highlight: **Let agents work. / Keep the keys.**
- Hero illustration (agent with collar, handshake, tools around).
- Scattered rose stars around (decorative, `aria-hidden`).

### 2. How it works — the leash
- A vertical leash runs down the middle and ends with the collar + AC tag.
- Three sage blobs, alternating left/right along the leash:
  1. **1. Give a task.** Tell your agent what to do before you go to bed.
  2. **2. Approve access.** Your agent asks only for what it needs. You approve with one tap.
  3. **3. Wake up to results.** Everything is ready in the morning. Nothing gets sent without your "yes".
- Each blob has its step illustration.
- Optional: the leash "draws itself" as you scroll (SVG stroke animation or clip reveal).

### 3. Manifesto
Raspberry blob, paper-colored text, centered:
> Agents are coming.
> They'll read your mail.
> They'll run your business.
> They'll work while you sleep.
> **Just not without a collar.** ← italic, on a sand marker highlight

### 4. Trust
- Heading: **Your agent never sees your password.**
- Four cards. On scroll they start **stacked like a deck** and **fan out / spread** into a row. On mobile: a horizontal swipe carousel with scroll-snap. (Try both, I will choose.)
  1. sage — **Short-lived.** Tokens expire in minutes. — icon: hourglass
  2. rose — **One task only.** Drafts can't become sends. — icon: target
  3. mist — **Revoke anytime.** One tap stops everything. — icon: open hand
  4. sand — **Fully logged.** Risky actions wait for your "yes". — icon: scroll
- Cards have a big empty area for the icon (keep it).

### 5. Footer — "above the Earth"
- Dark night-sky section (`ink`), wavy top edge.
- AC tag (light) at the top, a few rose stars, some slowly twinkling.
- The Earth sits at the bottom, only the top curve visible, like a horizon. Slow parallax / slow rotation feel. Airy, lots of empty space.
- CTA animation: at first the star sits on the Earth with curved text "Star on GitHub". On scroll, the star flies up, the text straightens, and it becomes a clear button.
- The final button must be a real `<a>` link to the GitHub repo, keyboard-focusable, with a visible hover/focus state.
- Small footer line: © AgentCollar · GitHub link.

## Done when
- Looks like the two reference screenshots on a phone (375px) and on desktop.
- Light and dark theme both work; the toggle works and remembers the choice.
- The site is live at `https://ank8dev.github.io/agentcollar/`.
- All animations work and are disabled with reduced motion.
- All text passes contrast 4.5:1.
- Lighthouse: no accessibility errors; images have alt text (decorative ones `alt=""`).
