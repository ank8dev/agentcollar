// Section: manifesto — see specs/manifesto.md
// Export init(); main.js calls it once.
//
// Motion: when the blob scrolls into view, the five lines fade/slide up one after
// another, then the marker band under the last line "draws" from left to right.
// Reduced motion: do nothing, the HTML/CSS already show the final state.
export function init({ gsap, reducedMotion }) {
  if (reducedMotion) return;

  const section = document.querySelector('.manifesto');
  if (!section) return;

  const lines = section.querySelectorAll('.manifesto__line');
  const band = section.querySelector('.manifesto__band');

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top 75%', // when the top of the blob is a quarter up the screen
      once: true,
    },
  });

  tl.from(lines, {
    opacity: 0,
    y: 40,
    duration: 0.7,
    ease: 'power2.out',
    stagger: 0.18,
  }).from(
    band,
    {
      scaleX: 0,
      duration: 0.6,
      ease: 'power2.inOut',
    },
    '-=0.2',
  );
}
