// Section: manifesto — see specs/manifesto.md
// Export init(); main.js calls it once.
//
// Motion: the raspberry blob is always there (no animation). The words are blurry
// and faint at first and come into focus one by one AS YOU SCROLL (scrubbed, so
// scrolling back blurs them again). After the last word the marker stroke under
// "Just not without a collar." draws itself left → right, also tied to the scroll.
// Reduced motion: do nothing, the HTML/CSS already show the final state.

// Wrap every word of `root` in <span class="manifesto__word">, keeping the spaces,
// <br>s and <em>/<strong> exactly where they are. The words stay inside the original
// <p>, so screen readers still read the sentence normally.
function splitWords(root) {
  const words = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach((node) => {
    if (!node.nodeValue.trim()) return; // whitespace between lines: leave it
    const frag = document.createDocumentFragment();
    node.nodeValue.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) {
        frag.appendChild(document.createTextNode(part));
      } else {
        const span = document.createElement('span');
        span.className = 'manifesto__word';
        span.textContent = part;
        frag.appendChild(span);
        words.push(span);
      }
    });
    node.replaceWith(frag);
  });
  return words;
}

export function init({ gsap, reducedMotion }) {
  if (reducedMotion) return;

  const section = document.querySelector('.manifesto');
  if (!section) return;

  const text = section.querySelector('.manifesto__text');
  const marker = section.querySelector('.manifesto__marker');
  const words = text ? splitWords(text) : [];
  if (!words.length) return;

  const tl = gsap.timeline({
    defaults: { ease: 'power1.out' },
    scrollTrigger: {
      trigger: text,
      start: 'top 85%', // first word starts clearing when the text enters the screen
      end: 'bottom 40%', // all clear a bit above the middle of the screen
      scrub: 0.8, // follows the scroll with a short, soft catch-up
    },
  });

  // Words: blurred (but visible) → sharp, one after another
  tl.fromTo(
    words,
    { opacity: 0.38, filter: 'blur(6px)', y: 6 }, // still blurry, but you can see there is text
    { opacity: 1, filter: 'blur(0px)', y: 0, duration: 1, stagger: 0.35 },
  );

  // Marker stroke after the last word
  if (marker) {
    tl.fromTo(
      marker,
      { clipPath: 'inset(0 100% 0 0)' },
      { clipPath: 'inset(0 0% 0 0)', duration: 2, ease: 'power1.inOut' },
      '-=0.3',
    );
  }
}
