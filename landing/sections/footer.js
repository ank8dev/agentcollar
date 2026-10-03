// Section: footer — see specs/footer.md
// Export init(); main.js calls it once.
//
// Three motions, all off with reduced motion (the HTML/CSS default IS the end state):
//  1. a few stars twinkle (slow opacity/scale loops),
//  2. the horizon (Earth + CTA) moves with a slow parallax and the Earth turns a little,
//  3. the CTA: the star sits on the Earth's top with "Star on GitHub" curved along the
//     horizon; while you scroll it flies up to the LEFT of the label, the label straightens
//     (ONE <textPath>; its path morphs arc → line, same "M Q" structure so GSAP tweens the
//     numbers in `d`), and finally a white marker outline is drawn around both → a button.

const FIGMA_W = 1512;
const FOOTER_TOP = 5200;

// Star boxes (Figma page px). END = the star's place inside the button (CSS default).
const END_STAR = { x: 406, y: 5745, w: 130, h: 125.3 };
const START_STAR = { x: 572, y: 5801, w: 343 };
const START_SCALE = START_STAR.w / END_STAR.w;
const START_X_PCT = ((START_STAR.x - END_STAR.x) / END_STAR.w) * 100;
const START_Y_PCT = ((START_STAR.y - END_STAR.y) / END_STAR.h) * 100;

// Label paths (page px; the label SVG's viewBox is in page coordinates).
// Start: arc concentric with the Earth (centre 772/6928, baseline radius 893).
// End: straight baseline y 5832 to the right of the star, centred on x 836.
const PATH_START = 'M442 6056 Q772 5925 1102 6056'; // lifted ~42 px so the curved label sits ON the horizon
const PATH_END = 'M566 5832 Q836 5832 1106 5832';
const FONT_START = 56;
const FONT_END = 64;
const BUTTON_CENTER_Y = 5810;

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

  const content = footer.querySelector('.site-footer__sticky');
  const outline = footer.querySelector('.footer-cta__outline-path');

  // gsap.matchMedia reverts everything below (tweens, inline styles, data-motion) when the
  // width crosses 768 px, then builds it again for the other layout.
  const mm = gsap.matchMedia();
  mm.add({ phone: '(max-width: 767.98px)', desktop: '(min-width: 768px)' }, () => {
    // footer.css adds a sticky phase (the content box holds at the screen bottom) on all
    // screens, so the whole flight is seen and the finished button stays on screen.
    footer.dataset.motion = 'sticky';

    // One Figma px in screen px for the footer's content (bigger on phones, see footer.css)
    const u = () => content.offsetWidth / FIGMA_W;

    // 2. Parallax: over the whole footer the horizon lags the scroll by 80 Figma px
    //    (it moves up a little slower than the page). Lands exactly on the spec at the page end.
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

    // 3. CTA: flight, then the outline.
    const footerDocTop = () => footer.getBoundingClientRect().top + window.scrollY;
    // The whole flight happens while the content box is stuck to the screen bottom. It
    // sticks when its bottom reaches the screen bottom and stays for the extra height
    // (--stick); the flight uses the first 85% of that, then a short hold on the button.
    const stickStart = () => footerDocTop() + content.offsetHeight - window.innerHeight;
    const stickLength = () => footer.offsetHeight - content.offsetHeight;
    const flightStart = () => stickStart();
    const flightEnd = () => {
      const end = Math.min(stickStart() + 0.85 * stickLength(), ScrollTrigger.maxScroll(window));
      return Math.max(end, flightStart() + 160);
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

    if (import.meta.env.DEV) window.__footerCTA = tl; // dev only: inspect the flight frame by frame

    // The button becomes clickable only once it is fully built (outline drawn).
    const link = footer.querySelector('.footer-cta');
    const arm = () => {
      if (link) link.dataset.armed = tl.progress() >= 0.97 ? 'true' : 'false';
    };
    tl.eventCallback('onUpdate', arm);
    arm();

    tl.fromTo(
      starbox,
      { xPercent: START_X_PCT, yPercent: START_Y_PCT, scale: START_SCALE, transformOrigin: '0 0' },
      { xPercent: 0, yPercent: 0, scale: 1 },
      0,
    )
      // the label straightens on the way up: one continuous morph, same timing as the star
      .fromTo(path, { attr: { d: PATH_START } }, { attr: { d: PATH_END } }, 0)
      .fromTo(text, { fontSize: FONT_START }, { fontSize: FONT_END }, 0);

    // …then the white marker outline is drawn around star + label (pathLength = 1000)
    if (outline) {
      tl.fromTo(
        outline,
        { strokeDasharray: 1000, strokeDashoffset: 1000 },
        { strokeDashoffset: 0, duration: 0.7, ease: 'power1.inOut' },
        0.85,
      );
    }

    return () => {
      delete footer.dataset.motion;
      if (link) delete link.dataset.armed;
    };
  });
}
