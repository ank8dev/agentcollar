// Our own, limited "rubber band" at the very bottom of the page (touch screens).
// The browser's overscroll is switched off (styles.css), so on the last screen a finger
// pulling up drags the page up with resistance — at most MAX px — revealing the spinning
// medallion behind it; on release the page glides back.
//
// Performance note: a touchmove listener that may call preventDefault() forces iOS to run
// every scroll through JavaScript (sticky elements then jitter). So that listener is only
// attached for a gesture that STARTS at the bottom of the page, and removed right after.

const MAX = 160; // px the page may be pulled up
const RESIST = 0.45; // finger moves 1 px → page moves 0.45 px

export function initPull({ gsap }) {
  // the footer's inner .page moves with its band
  const layers = document.querySelectorAll('.page:not(.page--footer), .footer-band');
  if (!layers.length) return;

  let startY = 0;
  let offset = 0;

  const atBottom = () =>
    window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;

  const move = (e) => {
    const pull = startY - e.touches[0].clientY; // > 0 = finger moved up
    if (pull <= 0) {
      if (offset) {
        offset = 0;
        gsap.set(layers, { clearProps: 'transform' });
      }
      return;
    }
    e.preventDefault(); // this drag is ours
    offset = MAX * (1 - Math.exp((-pull * RESIST) / MAX)); // soft limit, never passes MAX
    gsap.set(layers, { y: -offset });
  };

  const end = () => {
    window.removeEventListener('touchmove', move);
    window.removeEventListener('touchend', end);
    window.removeEventListener('touchcancel', end);
    if (!offset) return;
    offset = 0;
    // glide back smoothly (no bounce), then drop the transform entirely
    gsap.to(layers, { y: 0, duration: 0.55, ease: 'power3.out', clearProps: 'transform' });
  };

  window.addEventListener(
    'touchstart',
    (e) => {
      if (!atBottom()) return; // normal scrolling stays fully native
      startY = e.touches[0].clientY;
      window.addEventListener('touchmove', move, { passive: false });
      window.addEventListener('touchend', end, { passive: true });
      window.addEventListener('touchcancel', end, { passive: true });
    },
    { passive: true },
  );
}
