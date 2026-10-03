// Section: steps — see specs/steps.md
// Export init(); main.js calls it once.
//  - The leash "draws itself" top → bottom while you scroll through the section.
//  - Each blob (with its drawing and text) fades and slides in a little as it enters.
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

  // 2. Blobs + drawings + text: a soft fade/slide-in, one group per step.
  const blobs = section.querySelectorAll('.steps__blob');
  const arts = section.querySelectorAll('.steps__art');
  const texts = section.querySelectorAll('.steps__step');

  blobs.forEach((blob, i) => {
    const group = [blob, texts[i], arts[i]].filter(Boolean);
    const fromLeft = i % 2 === 0;
    gsap.from(group, {
      autoAlpha: 0,
      x: fromLeft ? -40 : 40,
      duration: 0.9,
      ease: 'power2.out',
      stagger: 0.12,
      scrollTrigger: {
        trigger: blob,
        start: 'top 80%',
        once: true,
      },
    });
  });
}
