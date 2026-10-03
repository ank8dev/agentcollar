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

// Geometry (Figma page px) per layout. END = the star's place inside the button; START = the
// star sitting on the Earth's top. Label paths are in page coordinates: START is an arc
// concentric with the Earth (the label rides on the horizon), END a straight baseline.
const GEO = {
  // phones: original Figma footer (Earth centre 772/6928, radius 882)
  phone: {
    end: { x: 406, y: 5745, w: 130, h: 125.3 },
    start: { x: 572, y: 5801, w: 343 },
    pathStart: 'M442 6056 Q772 5925 1102 6056',
    pathEnd: 'M566 5832 Q836 5832 1106 5832',
    fontStart: 56,
    fontEnd: 64,
  },
  // desktop: compact button under the medallion, big Earth (centre 772/7121, radius 1200)
  desktop: {
    end: { x: 504.6, y: 5712.2, w: 93.6, h: 90.2 },
    start: { x: 672, y: 5788, w: 200 },
    pathStart: 'M442 5910.2 Q772 5821.8 1102 5910.2',
    pathEnd: 'M619.8 5774.8 Q814.2 5774.8 1008.6 5774.8',
    fontStart: 46,
    fontEnd: 46,
  },
};

export function init({ gsap, ScrollTrigger, reducedMotion }) {
  const footer = document.querySelector('.site-footer');
  if (!footer) return;

  // Static end state for the current layout (also what reduced motion shows)
  const isPhone = window.matchMedia('(max-width: 767.98px)').matches;
  const endGeo = isPhone ? GEO.phone : GEO.desktop;
  footer.querySelector('.footer-cta__path')?.setAttribute('d', endGeo.pathEnd);
  const labelText = footer.querySelector('.footer-cta__label text');
  if (labelText) labelText.style.fontSize = endGeo.fontEnd + 'px';

  if (reducedMotion) return;

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
  mm.add({ phone: '(max-width: 767.98px)', desktop: '(min-width: 768px)' }, ({ conditions }) => {
    const phone = conditions.phone;
    const g = phone ? GEO.phone : GEO.desktop;
    // Phones: footer.css adds a sticky phase (the content box holds at the screen bottom).
    // Desktop keeps the full-width Figma footer and the original scroll-through flight.
    if (phone) footer.dataset.motion = 'sticky';

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
    let flightStart;
    let flightEnd;
    if (phone) {
      // Phones: the whole flight happens while the content box is stuck to the screen bottom.
      // It sticks when its bottom reaches the screen bottom and stays for the extra height
      // (--stick); the flight uses the first 85% of that, then a short hold on the button.
      const stickStart = () => footerDocTop() + content.offsetHeight - window.innerHeight;
      const stickLength = () => footer.offsetHeight - content.offsetHeight;
      flightStart = () => stickStart();
      flightEnd = () => {
        const end = Math.min(stickStart() + 0.85 * stickLength(), ScrollTrigger.maxScroll(window));
        return Math.max(end, flightStart() + 160);
      };
    } else {
      // Desktop: the footer is cut to one screen (footer.css), so the flight runs while it
      // scrolls in — from its top at 70% of the screen down to the page end, where the
      // finished button sits between the tag and the Earth.
      flightStart = () => footerDocTop() - 0.7 * window.innerHeight;
      flightEnd = () => Math.max(ScrollTrigger.maxScroll(window), flightStart() + 160);
    }

    // The button becomes clickable only once it is fully built (outline drawn).
    const link = footer.querySelector('.footer-cta');
    const arm = (p) => {
      if (link) link.dataset.armed = p >= 0.97 ? 'true' : 'false';
    };
    arm(0);

    const tl = gsap.timeline({
      defaults: { ease: 'power1.inOut', duration: 1 },
      scrollTrigger: {
        trigger: footer,
        start: flightStart,
        end: flightEnd,
        scrub: 0.6,
        invalidateOnRefresh: true,
        // the button is clickable once the scroll has reached the end of the flight
        onUpdate: (self) => arm(self.progress),
        onRefresh: (self) => arm(self.progress),
      },
    });

    if (import.meta.env.DEV) window.__footerCTA = tl; // dev only: inspect the flight frame by frame


    tl.fromTo(
      starbox,
      {
        xPercent: ((g.start.x - g.end.x) / g.end.w) * 100,
        yPercent: ((g.start.y - g.end.y) / g.end.h) * 100,
        scale: g.start.w / g.end.w,
        transformOrigin: '0 0',
      },
      { xPercent: 0, yPercent: 0, scale: 1 },
      0,
    )
      // the label straightens on the way up: one continuous morph, same timing as the star
      .fromTo(path, { attr: { d: g.pathStart } }, { attr: { d: g.pathEnd } }, 0)
      .fromTo(text, { fontSize: g.fontStart }, { fontSize: g.fontEnd }, 0);

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
