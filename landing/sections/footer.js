// Section: footer — see specs/footer.md
// Export init(); main.js calls it once.
//
// Three motions, all off with reduced motion (the HTML/CSS default IS the end state):
//  1. a few stars twinkle (slow opacity/scale loops),
//  2. the horizon (Earth + CTA) moves with a slow parallax and the Earth turns a little,
//  3. the CTA: a small star on the Earth's top with a curved label flies up under the tag.
//     The label is ONE <textPath>; its path morphs from the horizon arc to a straight line
//     (same "M Q" structure, so GSAP tweens the numbers inside `d`). Scrubbed by the scroll.

const FIGMA_W = 1512;
const FOOTER_TOP = 5200;

// Star boxes (Figma page px). The link box is the END star box; the star wrapper flies into it.
const END_STAR = { x: 489, y: 5537, w: 512, h: 493.4 };
const START_STAR = { x: 572, y: 5801, w: 343 };
const START_SCALE = START_STAR.w / END_STAR.w;
const START_X_PCT = ((START_STAR.x - END_STAR.x) / END_STAR.w) * 100;
const START_Y_PCT = ((START_STAR.y - END_STAR.y) / END_STAR.h) * 100;

// Label paths (page px, the label SVG's viewBox is in page coordinates).
// Start: quadratic fit of the arc concentric with the Earth (centre 772/6928, baseline radius 893):
//   ends at x 772 ± 330 on that circle, control point where the two end tangents meet.
// End: a straight line at baseline y 5827 (glyphs centred on y ≈ 5802), centred on the star (x 745).
const PATH_START = 'M442 6098.2 Q772 5967 1102 6098.2';
const PATH_END = 'M415 5827 Q745 5827 1075 5827';
const FONT_START = 60;
const FONT_END = 72;

export function init({ gsap, ScrollTrigger, reducedMotion }) {
  const footer = document.querySelector('.site-footer');
  if (!footer || reducedMotion) return;

  const starbox = footer.querySelector('.footer-cta__starbox');
  const path = footer.querySelector('.footer-cta__path');
  const text = footer.querySelector('.footer-cta__label text');
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
    const ideal = footerDocTop() + (END_STAR.y - FOOTER_TOP) * u() - 0.06 * window.innerHeight;
    const end = Math.min(ideal, ScrollTrigger.maxScroll(window));
    return Math.max(end, flightStart() + 120);
  };

  const tl = gsap.timeline({
    defaults: { ease: 'power1.inOut', duration: 1 },
    scrollTrigger: {
      trigger: footer,
      start: flightStart,
      end: flightEnd,
      scrub: 0.6,
      invalidateOnRefresh: true,
    },
  });

  tl.fromTo(
    starbox,
    { xPercent: START_X_PCT, yPercent: START_Y_PCT, scale: START_SCALE, transformOrigin: '0 0' },
    { xPercent: 0, yPercent: 0, scale: 1 },
    0,
  )
    // the label rides along and straightens out on the way up: one continuous morph, same timing as the star
    .fromTo(path, { attr: { d: PATH_START } }, { attr: { d: PATH_END } }, 0)
    .fromTo(text, { fontSize: FONT_START }, { fontSize: FONT_END }, 0);
}
