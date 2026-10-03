// Section: hero
// Intro on page load:
//  1. the sand marker paints itself left → right, like a real marker filling in a stripe
//     (a soft-edged gradient added to the stroke's mask sweeps across it);
//  2. then the headline types itself letter by letter, like a typewriter.
// Reduced motion: nothing happens, the HTML/CSS show the final state.

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
  if (reducedMotion) return;

  const marker = document.querySelector('.marker--hero');
  const title = document.querySelector('.hero__title');
  if (!marker || !title) return;

  // Screen readers get the whole sentence once, not letter by letter.
  title.setAttribute('aria-label', title.textContent.replace(/\s+/g, ' ').trim());
  const chars = splitChars(title);
  chars.forEach((c) => c.setAttribute('aria-hidden', 'true'));

  marker.classList.add('is-painting');
  gsap.set(marker, { '--paint': '0%' });
  gsap.set(chars, { opacity: 0 });

  const tl = gsap.timeline({ delay: 0.35 });

  // 1. Marker paints across (slight ease, like a hand speeding up then slowing)
  tl.to(marker, { '--paint': '115%', duration: 1.1, ease: 'power1.inOut' });

  // 2. Typewriter: each letter appears instantly, one after another
  tl.to(chars, { opacity: 1, duration: 0.01, stagger: 0.05, ease: 'none' }, '-=0.15');

  // Back to the plain mask when done (no gradient left behind)
  tl.add(() => marker.classList.remove('is-painting'));
}
