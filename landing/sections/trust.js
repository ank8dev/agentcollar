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
    gsap.set(list, { '--shift': 0 });
    gsap.set(cards, { '--dx': 0, '--tilt': 0 });

    // Same value as the CSS `top` of .trust__sticky, in px.
    const stickyTop = () =>
      Math.min(0, window.innerHeight - section.querySelector('.trust__sticky').offsetHeight);

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: section,
        // The sticky phase starts when the section top reaches the sticky offset
        // (0, or negative when the content is taller than the screen)…
        start: () => `top ${stickyTop()}px`,
        // …and lasts exactly the extra height added in CSS (--spread-distance: 200vh).
        end: () => `+=${window.innerHeight * 2}`,
        scrub: 0.5, // short, soft catch-up
        invalidateOnRefresh: true,
      },
    });

    // 1. deck → row, with a small fan rotation on the way
    cards.forEach((card, i) => {
      tl.to(card, { '--dx': ROW_X[i] - DECK_X[i], duration: 1, ease: 'power1.inOut' }, 0)
        .to(card, { '--tilt': TILT[i], duration: 0.5, ease: 'sine.out' }, 0)
        .to(card, { '--tilt': 0, duration: 0.5, ease: 'sine.in' }, 0.5);
    });
    // 2. short hold, then the whole row slides left so card 4 is fully visible
    tl.to(list, { '--shift': SHIFT, duration: 1.1, ease: 'power1.inOut' }, 1.15);
    tl.to({}, { duration: 0.15 }); // brief hold before the section scrolls on

    return () => {
      delete section.dataset.motion;
    };
  });

  // Fonts and images above can change the page height: re-measure once they are in.
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
}
