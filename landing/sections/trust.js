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
    gsap.set(list, { '--shift': 0 });
    gsap.set(cards, { '--dx': 0, '--tilt': 0, '--x': (i) => deckX[i] });

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

    // 1. deck → row, with a small fan rotation on the way
    cards.forEach((card, i) => {
      tl.to(card, { '--dx': rowX[i] - deckX[i], duration: 1, ease: 'power1.inOut' }, 0)
        .to(card, { '--tilt': TILT[i], duration: 0.5, ease: 'sine.out' }, 0)
        .to(card, { '--tilt': 0, duration: 0.5, ease: 'sine.in' }, 0.5);
    });
    // 2. short hold, then the whole row slides left so card 4 is fully visible
    tl.to(list, { '--shift': shift, duration: phone ? 2 : 1.1, ease: 'power1.inOut' }, 1.15);
    tl.to({}, { duration: 0.15 }); // brief hold before the section scrolls on

    return () => {
      delete section.dataset.motion;
    };
  });

  // Fonts and images above can change the page height: re-measure once they are in.
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
}
