// Section: manifesto — see specs/manifesto.md
// Export init(); main.js calls it once.
//
// Motion (plays once when the blob scrolls into view):
//  1. the raspberry blob pops in like jelly (elastic overshoot, squash-and-stretch,
//     rotation wobble, a subtle wobble of its outline);
//  2. the words pop in one by one (scale + little tilt + bounce);
//  3. the marker stroke under the last line draws itself left → right.
// Reduced motion: do nothing, the HTML/CSS already show the final state.

// Hand-made-looking variant of the blob path (same commands and number of points).
function wobblePath(d, amount, phase) {
  const nums = d.match(/-?\d*\.?\d+/g).map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = (maxX - minX) / 2;
  const ry = (maxY - minY) / 2;

  const out = [];
  for (let i = 0; i < nums.length; i += 2) {
    const x = nums[i];
    const y = nums[i + 1];
    const a = Math.atan2((y - cy) / ry, (x - cx) / rx);
    const f = amount * (Math.sin(3 * a + phase) + 0.5 * Math.sin(5 * a + 2 * phase));
    out.push((x + (x - cx) * f).toFixed(1), (y + (y - cy) * f).toFixed(1));
  }
  let k = 0;
  return d.replace(/-?\d*\.?\d+/g, () => out[k++]);
}

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

  const path = section.querySelector('.manifesto__blob path');
  const text = section.querySelector('.manifesto__text');
  const marker = section.querySelector('.manifesto__marker');
  const words = text ? splitWords(text) : [];

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top 75%', // when the top of the blob is a quarter up the screen
      once: true,
    },
  });

  // 1. Blob pop
  if (path) {
    const d = path.getAttribute('d');
    const wobbleA = wobblePath(d, 0.035, 0.9);
    const wobbleB = wobblePath(d, -0.03, 2.4);
    gsap.set(path, { transformOrigin: '50% 50%' });
    tl.fromTo(path, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.12, ease: 'none' }, 0)
      .fromTo(path, { scaleX: 0.3 }, { scaleX: 1, duration: 1.1, ease: 'elastic.out(1, 0.45)' }, 0)
      .fromTo(path, { scaleY: 0.22 }, { scaleY: 1, duration: 1.2, ease: 'elastic.out(1, 0.55)' }, 0.06)
      .fromTo(path, { rotation: -5 }, { rotation: 0, duration: 1.2, ease: 'elastic.out(1.1, 0.4)' }, 0)
      .fromTo(path, { attr: { d: wobbleA } }, { attr: { d: wobbleB }, duration: 0.3, ease: 'sine.inOut' }, 0)
      .to(path, { attr: { d }, duration: 0.9, ease: 'elastic.out(1, 0.35)' }, 0.3);
  }

  // 2. Words pop one by one
  if (words.length) {
    tl.fromTo(
      words,
      {
        autoAlpha: 0,
        scale: 0,
        y: -24,
        rotation: () => gsap.utils.random(-14, 14),
      },
      {
        autoAlpha: 1,
        scale: 1,
        y: 0,
        rotation: 0,
        duration: 0.55,
        ease: 'back.out(2.4)',
        stagger: 0.075,
      },
      0.45,
    );
  }

  // 3. Marker stroke draws left → right after the last word
  if (marker) {
    tl.fromTo(
      marker,
      { clipPath: 'inset(0 100% 0 0)' },
      { clipPath: 'inset(0 0% 0 0)', duration: 0.6, ease: 'power2.inOut' },
      '-=0.15',
    );
  }
}
