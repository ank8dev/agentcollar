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

gsap.registerPlugin(ScrollTrigger);

// Sections check this themselves: with reduced motion they show the final state, no animation.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Smooth scrolling (Lenis). It still uses the browser's real scroll position, so
// position: sticky and ScrollTrigger keep working; GSAP's ticker drives it so both
// update in the same frame.
if (!reducedMotion) {
  const lenis = new Lenis({ lerp: 0.1 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

for (const section of [hero, steps, manifesto, trust, footer]) {
  section.init({ gsap, ScrollTrigger, reducedMotion });
}

// Parallax: every decorative star drifts at its own speed while it passes the screen.
// Moves the CSS `translate` property via --py, so it never fights the star's own
// `rotate` (Figma tilt) or the footer's twinkle (`scale`).
if (!reducedMotion) {
  gsap.utils.toArray('.star:not(.footer-cta__star)').forEach((star) => {
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

// Font tweaks panel: dev server or ?tweaks only.
initTweaks({ ScrollTrigger });
