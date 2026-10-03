// Section: steps — see specs/steps.md
// Export init(); main.js calls it once.
//  - The leash "draws itself" top → bottom while you scroll through the section.
//  - Each blob pops in like jelly when it enters (small → elastic overshoot, a little
//    squash-and-stretch, a rotation wobble and a subtle wobble of its outline), then
//    its text and drawing bounce in right after. Plays once, not scrubbed.
// With reduced motion nothing is animated: the HTML/CSS already shows the final state.

// Make a hand-made-looking variant of a blob path: every point is pushed in or out
// from the centre by a smooth function of its angle. Same commands, same number of
// points, so GSAP can tween `attr: { d }` between the variants.
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

// Add a cartoon "pop" of one blob path to a timeline, starting at `at`.
function popBlob(gsap, tl, path, at = 0) {
  const d = path.getAttribute('d');
  const wobbleA = wobblePath(d, 0.05, 0.7);
  const wobbleB = wobblePath(d, -0.04, 2.1);

  gsap.set(path, { transformOrigin: '50% 50%' });
  tl.fromTo(path, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.12, ease: 'none' }, at)
    // scaleX and scaleY settle slightly out of phase → squash and stretch
    .fromTo(path, { scaleX: 0.3 }, { scaleX: 1, duration: 1.1, ease: 'elastic.out(1, 0.45)' }, at)
    .fromTo(path, { scaleY: 0.22 }, { scaleY: 1, duration: 1.2, ease: 'elastic.out(1, 0.55)' }, at + 0.06)
    .fromTo(path, { rotation: -9 }, { rotation: 0, duration: 1.2, ease: 'elastic.out(1.1, 0.4)' }, at)
    // the outline wobbles a little and settles on the real shape
    .fromTo(path, { attr: { d: wobbleA } }, { attr: { d: wobbleB }, duration: 0.3, ease: 'sine.inOut' }, at)
    .to(path, { attr: { d }, duration: 0.9, ease: 'elastic.out(1, 0.35)' }, at + 0.3);
}

export function init({ gsap, reducedMotion }) {
  const section = document.querySelector('.steps');
  if (!section || reducedMotion) return;

  // 1. Leash: reveal with a clip-path, scrubbed by the scroll position.
  const leash = section.querySelector('.steps__leash');
  if (leash) {
    gsap.fromTo(
      leash,
      { clipPath: 'inset(0% 0% 100% 0%)' },
      {
        clipPath: 'inset(0% 0% 0% 0%)',
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top 75%',
          end: 'bottom bottom',
          scrub: true,
        },
      },
    );
  }

  // 2. Blobs pop, then their text and drawing bounce in, one group per step.
  const blobs = section.querySelectorAll('.steps__blob');
  const arts = section.querySelectorAll('.steps__art');
  const texts = section.querySelectorAll('.steps__step');

  blobs.forEach((blob, i) => {
    const path = blob.querySelector('path');
    if (!path) return;

    const tl = gsap.timeline({
      scrollTrigger: { trigger: blob, start: 'top 80%', once: true },
    });
    popBlob(gsap, tl, path, 0);

    const inside = [texts[i], arts[i]].filter(Boolean);
    const tilt = i % 2 === 0 ? -5 : 5;
    tl.fromTo(
      inside,
      { autoAlpha: 0, scale: 0.5, y: 30, rotation: tilt },
      {
        autoAlpha: 1,
        scale: 1,
        y: 0,
        rotation: 0,
        duration: 0.7,
        ease: 'back.out(2.2)',
        stagger: 0.1,
      },
      0.35,
    );
  });
}
