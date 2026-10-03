// Section: trust — see specs/trust.md
// Four cards start stacked like a deck, then spread into a row while the section is held
// on screen by CSS position: sticky (see trust.css) — the browser does the holding, so it
// stays perfectly in sync with the scroll; GSAP only scrubs the cards by scroll progress.
// Positions are Figma px; CSS multiplies them by --u, so the animation scales with the page
// and needs no recalculation on resize.

const DECK_X = [86, 246, 428, 615]; // also written as --x on each card in index.html
const ROW_X = [87, 732, 1369, 2025];
const TILT = [-4, -2, 2, 4]; // fan rotation mid-way, settles back to 0
const CARD_W = 590;
const FRAME = 1512;
const EDGE = 87;
// Phase 2: slide the row left until card 4's right edge sits at 1512 − 87.
const SHIFT = FRAME - EDGE - (ROW_X[3] + CARD_W); // −1190

// Phones: cards use a 2.1× bigger scale (trust.css), so in their units the screen is
// 1512 / 2.1 ≈ 720 wide. Deck centred, row with 40-unit gaps, then the row slides until
// card 4 sits centred too — every card passes through the middle of the screen.
const PHONE_SCALE = 2.1;
const PHONE_C = (FRAME / PHONE_SCALE - CARD_W) / 2; // left x of a centred card
const PHONE_DECK_X = [-42, -28, -14, 0].map((d) => PHONE_C + d); // top card exactly centred
const PHONE_ROW_X = [0, 1, 2, 3].map((i) => PHONE_C + i * (CARD_W + 40));
const PHONE_SHIFT = -(PHONE_ROW_X[3] - PHONE_C);

export function init({ gsap, ScrollTrigger, reducedMotion }) {
  const section = document.querySelector('.trust');
  if (!section) return;
  const list = section.querySelector('.trust-cards');
  const cards = [...list.children];

  // Dev-only shortcut to compare the two phone variants: ?cards=fan or ?cards=carousel
  const choice = new URLSearchParams(location.search).get('cards');
  if (choice === 'fan' || choice === 'carousel') section.dataset.mobileCards = choice;

  const mm = gsap.matchMedia();
  // gsap.matchMedia runs the callback when any condition matches and reverts it all
  // (tweens, inline styles) when crossing 768 px, then runs it again.
  mm.add({ phone: '(max-width: 767.98px)', desktop: '(min-width: 768px)' }, ({ conditions }) => {
    // Carousel: pure CSS scroll-snap. Only make the scroller reachable by keyboard.
    if (conditions.phone && section.dataset.mobileCards === 'carousel') {
      list.tabIndex = 0;
      return () => list.removeAttribute('tabindex');
    }

    // Reduced motion: keep the CSS default, a static 2×2 grid. No sticky, no tweens.
    if (reducedMotion) return;

    section.dataset.motion = 'deck';
    const phone = conditions.phone;
    const deckX = phone ? PHONE_DECK_X : DECK_X;
    const rowX = phone ? PHONE_ROW_X : ROW_X;
    const shift = phone ? PHONE_SHIFT : SHIFT;
    // Phones: step-by-step instead of following the finger frame by frame. On iPhones any
    // per-frame scroll-linked motion inside the sticky block shakes (Safari keeps the sticky
    // block and the animation slightly out of sync). So the scroll only picks a STEP —
    // deck, then card 1…4 in the centre — and a CSS transition glides the cards there,
    // run by the browser on its own. JS writes to the DOM only when the step changes.
    if (phone) {
      const sticky = section.querySelector('.trust__sticky');
      const stickyTop = () => parseFloat(getComputedStyle(sticky).top) || 0;
      section.dataset.scrollAnim = 'steps';
      // (no gsap.set on these elements: GSAP would write `translate: none` inline and
      // override the CSS translate that the transition animates)
      cards.forEach((card, i) => card.style.setProperty('--x', deckX[i]));
      let step = -1;
      const show = (next) => {
        if (next === step) return;
        step = next;
        cards.forEach((card, i) => {
          card.style.setProperty('--dx', step === 0 ? 0 : rowX[i] - deckX[i]);
          card.style.setProperty('--tilt', 0);
        });
        list.style.setProperty('--shift', step <= 1 ? 0 : -(step - 1) * (CARD_W + 40));
      };
      show(0);
      const st = ScrollTrigger.create({
        trigger: sticky,
        start: () => `top ${stickyTop()}px`,
        end: () => `+=${window.innerHeight * 2}`,
        invalidateOnRefresh: true,
        // 0 = deck, 1–4 = card 1–4 in the centre
        onUpdate: ({ progress: p }) => show(p < 0.1 ? 0 : p < 0.32 ? 1 : p < 0.52 ? 2 : p < 0.72 ? 3 : 4),
      });
      return () => {
        st.kill();
        delete section.dataset.motion;
        delete section.dataset.scrollAnim;
        cards.forEach((card) => ['--dx', '--x', '--tilt'].forEach((p) => card.style.removeProperty(p)));
        list.style.removeProperty('--shift');
      };
    }

    gsap.set(cards, { '--x': (i) => deckX[i], force3D: true });
    gsap.set(list, { force3D: true });

    // Preferred: CSS scroll-driven animation (trust.css). The browser runs it on the same
    // fast thread as the scrolling itself, so the sticky block can't shake (on iPhones a
    // JS-driven version jittered). JS only hands over the target numbers once.
    if (CSS.supports('animation-timeline: view()')) {
      gsap.set(cards, { '--dx-end': (i) => rowX[i] - deckX[i], '--tilt-mid': (i) => TILT[i] });
      gsap.set(list, { '--shift-end': shift });
      section.dataset.scrollAnim = 'css';
      return () => {
        delete section.dataset.motion;
        delete section.dataset.scrollAnim;
      };
    }

    // The cards' sticky box and its CSS `top` (px) — the spread starts when it sticks.
    const sticky = section.querySelector('.trust__sticky');
    const stickyTop = () => parseFloat(getComputedStyle(sticky).top) || 0;

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: sticky,
        // The spread starts when the cards' box reaches its sticky position…
        start: () => `top ${stickyTop()}px`,
        // …and lasts exactly the extra height added in CSS (--spread-distance: 200vh).
        end: () => `+=${window.innerHeight * 2}`,
        scrub: 0.5, // short, soft catch-up
        invalidateOnRefresh: true,
      },
    });

    if (import.meta.env.DEV) window.__trustTL = tl; // dev only: inspect frame by frame

    // Moves use plain transforms (x / rotation, GPU-composited) instead of CSS variables,
    // so the browser doesn't recalculate styles every frame (that made the cards shake on
    // iPhones). Figma units → px: one card is 590 Figma px wide.
    const px = () => cards[0].offsetWidth / CARD_W;

    // 1. deck → row, with a small fan rotation on the way
    cards.forEach((card, i) => {
      tl.to(card, { x: () => (rowX[i] - deckX[i]) * px(), duration: 1, ease: 'power1.inOut' }, 0)
        .to(card, { rotation: TILT[i], duration: 0.5, ease: 'sine.out' }, 0)
        .to(card, { rotation: 0, duration: 0.5, ease: 'sine.in' }, 0.5);
    });
    // 2. short hold, then the whole row slides left so card 4 is fully visible
    tl.to(list, { x: () => shift * px(), duration: phone ? 2 : 1.1, ease: 'power1.inOut' }, 1.15);
    tl.to({}, { duration: 0.15 }); // brief hold before the section scrolls on

    return () => {
      delete section.dataset.motion;
    };
  });

  // Fonts and images above can change the page height: re-measure once they are in.
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
}
