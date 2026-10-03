// Section: steps — see specs/steps.md
// Export init(); main.js calls it once.
//  - The leash "draws itself" top → bottom while you scroll through the section (desktop only;
//    phones hide the leash).
//  - Each step (blob + text + drawing) slides in from its own side when it enters:
//    step 1 and 3 from the left, step 2 from the right. Smooth ease-out, plays once.
//  - Parallax: while a step passes the screen, its layers drift at different speeds
//    (blob slowest, drawing faster, text fastest), which reads as depth. On phones (steps
//    in a column) only the drawing drifts a little inside its blob.
// With reduced motion nothing is animated: the HTML/CSS already shows the final state.

export function init({ gsap, reducedMotion }) {
  const section = document.querySelector('.steps');
  if (!section || reducedMotion) return;

  const leash = section.querySelector('.steps__leash');
  const blobs = section.querySelectorAll('.steps__blob');
  const arts = section.querySelectorAll('.steps__art');
  const texts = section.querySelectorAll('.steps__step');
  // One Figma px in screen px (the page scales with the viewport, max 1512 wide)
  const u = () => document.querySelector('.page').clientWidth / 1512;

  const mm = gsap.matchMedia();
  // gsap.matchMedia reverts every tween (and its inline styles) when crossing 768 px.
  mm.add({ phone: '(max-width: 767.98px)', desktop: '(min-width: 768px)' }, ({ conditions }) => {
    const phone = conditions.phone;

    // 1. Leash: reveal with a clip-path, scrubbed by the scroll position.
    if (leash && !phone) {
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

    // 2. Steps slide in from their side, then drift with a layered parallax.
    blobs.forEach((blob, i) => {
      // Desktop keeps the original order; phones go top → bottom (blob, text, drawing)
      const layers = (phone ? [blob, texts[i], arts[i]] : [blob, arts[i], texts[i]]).filter(Boolean);
      const side = i % 2 === 0 ? -1 : 1; // left, right, left

      // Slide in from off-screen on that side
      gsap.fromTo(
        layers,
        { x: () => side * (phone ? window.innerWidth * 0.8 : 700 * u()), autoAlpha: 0 },
        {
          x: 0,
          autoAlpha: 1,
          duration: phone ? 1 : 1.2,
          ease: 'power3.out',
          stagger: phone ? 0.1 : 0.12,
          scrollTrigger: {
            trigger: phone ? texts[i] || blob : blob,
            start: phone ? 'top 88%' : 'top 85%',
            once: true,
          },
        },
      );

      // Phones: only the drawing drifts a little (px), so nothing leaves its blob.
      if (phone) {
        if (!arts[i]) return;
        gsap.fromTo(
          arts[i],
          { y: 14 },
          {
            y: -14,
            ease: 'none',
            scrollTrigger: { trigger: blob, start: 'top bottom', end: 'bottom top', scrub: true },
          },
        );
        return;
      }

      // Desktop: layered parallax (Figma px of vertical drift across the whole pass)
      const DRIFT = [60, 130, 180]; // blob, drawing, text
      layers.forEach((layer, k) => {
        gsap.fromTo(
          layer,
          { y: () => (DRIFT[k] / 2) * u() },
          {
            y: () => (-DRIFT[k] / 2) * u(),
            ease: 'none',
            scrollTrigger: {
              trigger: blob,
              start: 'top bottom',
              end: 'bottom top',
              scrub: true,
              invalidateOnRefresh: true,
            },
          },
        );
      });
    });
  });
}
