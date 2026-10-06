// Docs page behaviour: the website's preloader, smooth scrolling (Lenis, like the site),
// copy buttons, the language switcher, the current section highlighted in the contents,
// and the footer button's outline drawn when it comes into view.

import { gsap } from 'gsap';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { runPreloader } from '../preloader.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (reducedMotion) document.documentElement.classList.remove('preloading');
else runPreloader({ gsap });

// Smooth scrolling. It keeps the browser's real scroll position, so the sticky contents
// and titles still work. Links to sections glide there instead of jumping, stopping
// below the header and the sticky title (the page's scroll-padding-top).
let lenis = null;
if (!reducedMotion) {
  lenis = new Lenis({ lerp: 0.1 });
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}
const headerRoom = () => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || !lenis || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const target = document.getElementById(decodeURIComponent(a.hash.slice(1)));
  if (!target) return;
  e.preventDefault();
  lenis.scrollTo(target, { offset: -headerRoom(), duration: 1.1 });
  history.pushState(null, '', a.hash);
});

const body = document.body;
const COPY = body.dataset.copy || 'copy';
const COPIED = body.dataset.copied || 'copied';

// copy buttons
for (const button of document.querySelectorAll('.copy')) {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = COPIED;
    } catch {
      // no clipboard access: select the text so ⌘C / Ctrl+C works
      const range = document.createRange();
      range.selectNodeContents(button.parentElement.querySelector('pre'));
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = '⌘C';
    }
    setTimeout(() => (button.textContent = COPY), 1400);
  });
}

// language switcher: go to the same section in the other language
const lang = document.getElementById('lang');
lang?.addEventListener('change', () => {
  location.href = new URL(lang.value, location.href).pathname + location.hash;
});

// highlight the section you are reading in the contents
const links = [...document.querySelectorAll('#toc a')];
const byId = new Map(links.map((a) => [a.hash.slice(1), a]));
const narrow = matchMedia('(max-width: 880px)');
const observer = new IntersectionObserver(
  (entries) => {
    const visible = entries.find((e) => e.isIntersecting);
    if (!visible) return;
    const link = byId.get(visible.target.id);
    if (!link) return;
    for (const a of links) a.classList.toggle('on', a === link);
    if (narrow.matches) {
      // keep the active pill in view in the horizontal bar (only that bar scrolls,
      // never the page)
      const bar = link.closest('ol');
      const r = link.getBoundingClientRect();
      const left = bar.scrollLeft + r.left - bar.getBoundingClientRect().left - (bar.clientWidth - r.width) / 2;
      bar.scrollTo({ left, behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  },
  { rootMargin: '-20% 0px -70% 0px' },
);
for (const id of byId.keys()) {
  const target = document.getElementById(id);
  if (target) observer.observe(target);
}

// the footer button's hand-drawn outline: drawn once, when it comes into view
const cta = document.querySelector('.doc-foot__cta');
if (cta && !reducedMotion) {
  cta.dataset.armed = 'false';
  const drawObserver = new IntersectionObserver(
    (entries) => {
      if (!entries[0].isIntersecting) return;
      cta.dataset.armed = 'true';
      drawObserver.disconnect();
    },
    { threshold: 0.6 },
  );
  drawObserver.observe(cta);
}
