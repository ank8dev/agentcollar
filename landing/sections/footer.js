// Section: footer — see specs/footer.md
// Export init(); main.js calls it once.
//
// Three motions, all off with reduced motion (the CSS default IS the end state):
//  1. a few stars twinkle (slow opacity/scale loops),
//  2. the horizon (Earth + CTA) moves with a slow parallax and the Earth turns a little,
//  3. the CTA: a small star on the Earth's top with curved text flies up under the tag
//     and becomes a button with a straight label. Scrubbed by the scroll.

const FIGMA_W = 1512;
const FOOTER_TOP = 5200;

// CTA boxes (Figma page px). The link box is the end state; the star sits 84px into it.
const END = { x: 405, y: 5537, w: 680, h: 493.4, starLeft: 84, starW: 512 };
const START_STAR = { x: 572, y: 5801, w: 343 };
const START_SCALE = START_STAR.w / END.starW;
// Where the link box must start so that its star lands on START_STAR (transform-origin 0 0).
const START_X = START_STAR.x - END.starLeft * START_SCALE;
const START_X_PCT = ((START_X - END.x) / END.w) * 100;
const START_Y_PCT = ((START_STAR.y - END.y) / END.h) * 100;

export function init({ gsap, ScrollTrigger, reducedMotion }) {
  const footer = document.querySelector('.site-footer');
  if (!footer || reducedMotion) return;

  const cta = footer.querySelector('.footer-cta');
  const pill = footer.querySelector('.footer-cta__pill');
  const label = footer.querySelector('.footer-cta__label');
  const curved = footer.querySelector('.footer-cta__curved');
  const horizon = footer.querySelector('.site-footer__horizon');
  const earth = footer.querySelector('.site-footer__earth');

  // 1. Twinkle
  footer.querySelectorAll('.site-footer__twinkle').forEach((star) => {
    gsap.to(star, {
      opacity: 0.35,
      scale: 0.8,
      duration: gsap.utils.random(3, 6),
      delay: gsap.utils.random(0, 3),
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
    });
  });

  // 2. Parallax: over the whole footer the horizon lags the scroll by 80 Figma px
  //    (it moves up a little slower than the page). Lands exactly on the spec at the page end.
  const u = () => footer.offsetWidth / FIGMA_W;
  gsap.fromTo(
    horizon,
    { y: () => -80 * u() },
    {
      y: 0,
      ease: 'none',
      scrollTrigger: {
        trigger: footer,
        start: 'top bottom',
        end: 'bottom bottom',
        scrub: true,
        invalidateOnRefresh: true,
      },
    },
  );
  gsap.fromTo(
    earth,
    { rotate: -4 },
    {
      rotate: 0,
      ease: 'none',
      scrollTrigger: { trigger: footer, start: 'top bottom', end: 'bottom bottom', scrub: true },
    },
  );

  // 3. CTA flight.
  //    Starts when the small star (and its curved label) is fully on screen,
  //    ends when the big star is fully on screen under the tag (or at the page end, if sooner).
  const footerDocTop = () => footer.getBoundingClientRect().top + window.scrollY;
  const flightStart = () => footerDocTop() + (6131 - FOOTER_TOP) * u() - window.innerHeight;
  const flightEnd = () => {
    const ideal = footerDocTop() + (END.y - FOOTER_TOP) * u() - 0.06 * window.innerHeight;
    const end = Math.min(ideal, ScrollTrigger.maxScroll(window));
    return Math.max(end, flightStart() + 120);
  };

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: footer,
      start: flightStart,
      end: flightEnd,
      scrub: 0.6,
      invalidateOnRefresh: true,
    },
  });

  tl.fromTo(
    cta,
    { xPercent: START_X_PCT, yPercent: START_Y_PCT, scale: START_SCALE, transformOrigin: '0 0' },
    { xPercent: 0, yPercent: 0, scale: 1, duration: 1, ease: 'power1.inOut' },
    0,
  )
    // curved text fades out early, the straight label + pill fade in late
    .fromTo(curved, { opacity: 1 }, { opacity: 0, duration: 0.35 }, 0.1)
    .fromTo([pill, label], { opacity: 0 }, { opacity: 1, duration: 0.35 }, 0.6);
}
