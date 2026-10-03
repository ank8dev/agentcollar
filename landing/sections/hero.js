// Section: hero
// Intro on page load:
//  1. the sand marker is DRAWN like a real marker: one thick hand-drawn line
//     (.hero__stroke) grows from start to end (stroke-dashoffset 1000 → 0, pathLength=1000);
//  2. then the headline types itself letter by letter, like a typewriter.
// The starting state is set by CSS (html.intro, added in <head>) so nothing flashes.
// Reduced motion: no html.intro → everything is simply shown.

// Wrap every character of `el` in a span (keeping <br>s). Returns the spans.
function splitChars(el) {
  const chars = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const frag = document.createDocumentFragment();
    for (const ch of node.nodeValue) {
      const span = document.createElement('span');
      span.className = 'hero__char';
      span.textContent = ch;
      frag.append(span);
      chars.push(span);
    }
    node.replaceWith(frag);
  });
  return chars;
}

export function init({ gsap, reducedMotion }) {
  const root = document.documentElement;
  const stroke = document.querySelector('.hero__stroke');
  const title = document.querySelector('.hero__title');
  if (reducedMotion || !stroke || !title) {
    root.classList.remove('intro');
    return;
  }

  // Screen readers get the whole sentence once, not letter by letter.
  title.setAttribute('aria-label', title.textContent.replace(/\s+/g, ' ').trim());
  const chars = splitChars(title);
  chars.forEach((c) => c.setAttribute('aria-hidden', 'true'));

  // Take over the starting state from CSS, then drop the class.
  gsap.set(stroke, { strokeDasharray: 1000, strokeDashoffset: 1000 }); // pathLength=1000 (big enough that GSAP's px rounding is invisible)
  gsap.set(chars, { opacity: 0 });
  gsap.set(title, { opacity: 1 });
  root.classList.remove('intro');

  const tl = gsap.timeline({ delay: 0.4 });
  if (import.meta.env.DEV) window.__heroIntro = tl; // dev only: inspect the intro frame by frame

  // 1. The marker scribbles back and forth (steady hand: gentle in/out)
  tl.to(stroke, { strokeDashoffset: 0, duration: 1.8, ease: 'sine.inOut' });

  // 2. Typewriter: each letter appears instantly, one after another
  tl.to(chars, { opacity: 1, duration: 0.01, stagger: 0.05, ease: 'none' }, '-=0.1');
}
