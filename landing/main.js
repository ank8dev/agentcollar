import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

import * as hero from './sections/hero.js';
import * as steps from './sections/steps.js';
import * as manifesto from './sections/manifesto.js';
import * as trust from './sections/trust.js';
import * as footer from './sections/footer.js';
import { initTweaks } from './tweaks.js';
import { initPull } from './pull.js';

gsap.registerPlugin(ScrollTrigger);
// Phones: the browser's toolbars hide/show while scrolling, which fires "resize". Without
// this, every such resize re-measures all scroll animations and the sticky cards jump.
ScrollTrigger.config({ ignoreMobileResize: true });

// Sections check this themselves: with reduced motion they show the final state, no animation.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Smooth scrolling (Lenis) — for mouse wheels / trackpads only. It still uses the browser's
// real scroll position, so position: sticky and ScrollTrigger keep working; GSAP's ticker
// drives it so both update in the same frame. On touch screens it is NOT started: its
// touch listeners make iOS run every scroll through JavaScript, and sticky blocks (the
// trust heading + cards) then shake. Native touch scrolling is smooth already.
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
if (!reducedMotion && !finePointer) {
  // Touch screens: GSAP drives the scrolling itself, in sync with the animations. Otherwise
  // iOS scrolls on its own thread while GSAP moves the cards on the main thread, and Safari
  // re-positions the sticky trust block from stale scroll data — it visibly shakes.
  ScrollTrigger.normalizeScroll(true);
}

if (!reducedMotion && finePointer) {
  const lenis = new Lenis({ lerp: 0.1 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

for (const section of [hero, steps, manifesto, trust, footer]) {
  section.init({ gsap, ScrollTrigger, reducedMotion });
}

// Header: night version while the footer is under it (Safari also tints its top bar from it).
const header = document.querySelector('.site-header');
const footerBand = document.querySelector('.footer-band');
if (header && footerBand) {
  ScrollTrigger.create({
    trigger: footerBand,
    start: () => `top ${header.offsetHeight}px`,
    // dark from the moment the footer reaches the header until you scroll back above it
    onEnter: () => header.classList.add('site-header--night'),
    onLeaveBack: () => header.classList.remove('site-header--night'),
  });
}


// Browser toolbar color (Safari/Chrome on phones): paper, and night sky once the footer
// fills the screen, so the bars blend into the space scene instead of showing a yellow strip.
const themeMeta = document.querySelector('meta[name="theme-color"]');
const band = document.querySelector('.footer-band');
if (themeMeta && band) {
  ScrollTrigger.create({
    trigger: band,
    start: 'top top',
    onEnter: () => themeMeta.setAttribute('content', '#04080f'),
    onLeaveBack: () => themeMeta.setAttribute('content', '#f0f6e7'),
  });
}

// Parallax: every decorative star drifts at its own speed while it passes the screen.
// Moves the CSS `translate` property via --py, so it never fights the star's own
// `rotate` (Figma tilt) or the footer's twinkle (`scale`).
if (!reducedMotion) {
  gsap.utils.toArray('.star:not(.footer-cta__star):not(.site-header__star-icon)').forEach((star) => {
    const depth = gsap.utils.random(60, 220); // Figma px of travel; bigger = "closer"
    gsap.fromTo(
      star,
      { '--py': depth / 2 },
      {
        '--py': -depth / 2,
        ease: 'none',
        scrollTrigger: { trigger: star, start: 'top bottom', end: 'bottom top', scrub: true },
      },
    );
  });
}

// No pinch-zoom (iOS Safari ignores user-scalable=no; its own gesture events still fire).
for (const type of ['gesturestart', 'gesturechange']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

// Limited pull-up at the very bottom that reveals the spinning medallion (touch screens)
initPull({ gsap });

// Font tweaks panel: dev server or ?tweaks only.
initTweaks({ ScrollTrigger });
