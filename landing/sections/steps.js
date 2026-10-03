// Section: steps — see specs/steps.md
// Export init(); main.js calls it once.
//  - The leash "draws itself" top → bottom while you scroll through the section.
//  - Each blob fades in and grows slightly when it enters (smooth ease, no bounce),
//    then its text and drawing drift up into place. Plays once, not scrubbed.
// With reduced motion nothing is animated: the HTML/CSS already shows the final state.

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

  // 2. Blobs fade/grow in, then their text and drawing drift up, one group per step.
  const blobs = section.querySelectorAll('.steps__blob');
  const arts = section.querySelectorAll('.steps__art');
  const texts = section.querySelectorAll('.steps__step');

  blobs.forEach((blob, i) => {
    const path = blob.querySelector('path');
    if (!path) return;

    const tl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      scrollTrigger: { trigger: blob, start: 'top 80%', once: true },
    });

    gsap.set(path, { transformOrigin: '50% 50%' });
    tl.fromTo(path, { autoAlpha: 0, scale: 0.9 }, { autoAlpha: 1, scale: 1, duration: 1.1 });

    const inside = [texts[i], arts[i]].filter(Boolean);
    tl.fromTo(
      inside,
      { autoAlpha: 0, y: 28 },
      { autoAlpha: 1, y: 0, duration: 0.9, ease: 'power2.out', stagger: 0.15 },
      0.3,
    );
  });
}
