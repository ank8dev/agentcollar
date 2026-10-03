import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import * as steps from './sections/steps.js';
import * as manifesto from './sections/manifesto.js';
import * as trust from './sections/trust.js';
import * as footer from './sections/footer.js';
import { initTweaks } from './tweaks.js';

gsap.registerPlugin(ScrollTrigger);

// Sections check this themselves: with reduced motion they show the final state, no animation.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

for (const section of [steps, manifesto, trust, footer]) {
  section.init({ gsap, ScrollTrigger, reducedMotion });
}

// Font tweaks panel: dev server or ?tweaks only.
initTweaks({ ScrollTrigger });
