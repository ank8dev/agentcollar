// Our own, limited "rubber band" at the very bottom of the page (touch screens).
// The browser's overscroll is switched off (styles.css), so on the last screen a finger
// pulling up drags the page up with resistance — at most MAX px — revealing the spinning
// medallion behind it; on release the page springs back.

const MAX = 160; // px the page may be pulled up
const RESIST = 0.45; // finger moves 1 px → page moves 0.45 px

export function initPull({ gsap }) {
  const layers = document.querySelectorAll('.page:not(.page--footer), .footer-band'); // the footer's inner .page moves with its band
  if (!layers.length) return;

  let startY = null;
  let offset = 0;

  const atBottom = () =>
    window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;

  const set = (y) => {
    offset = y;
    gsap.set(layers, { y: -y });
  };

  window.addEventListener(
    'touchstart',
    (e) => {
      startY = atBottom() ? e.touches[0].clientY : null;
    },
    { passive: true },
  );

  window.addEventListener(
    'touchmove',
    (e) => {
      if (startY === null) {
        if (!atBottom()) return;
        startY = e.touches[0].clientY; // reached the bottom during this gesture
      }
      const pull = startY - e.touches[0].clientY; // > 0 = finger moved up
      if (pull <= 0) {
        if (offset) set(0);
        return;
      }
      e.preventDefault(); // we handle this drag ourselves
      // soft limit: approaches MAX but never passes it
      set(MAX * (1 - Math.exp((-pull * RESIST) / MAX)));
    },
    { passive: false },
  );

  const release = () => {
    startY = null;
    if (!offset) return;
    gsap.to(layers, {
      y: 0,
      duration: 0.6,
      ease: 'elastic.out(1, 0.6)',
      onUpdate: () => (offset = -gsap.getProperty(layers[0], 'y')),
    });
  };
  window.addEventListener('touchend', release, { passive: true });
  window.addEventListener('touchcancel', release, { passive: true });
}
