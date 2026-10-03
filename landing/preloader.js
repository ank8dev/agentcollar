// Preloader: the AC medallion spins while the page really loads (fonts + every image,
// including the big Earth). Then "AgentCollar" types itself letter by letter (like the hero
// headline), un-types, and the medallion shrinks and flies into the header's icon while the
// screen fades away. Resolves when it is gone, so the hero intro can start right after.

const MIN_SPIN = 900; // ms: don't flash by on a fast connection
const MAX_WAIT = 8000; // ms: never block the page longer than this

const pageLoaded = () =>
  new Promise((resolve) => {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve, { once: true });
  });

export function runPreloader({ gsap }) {
  const root = document.documentElement;
  const el = document.querySelector('.preloader');
  if (!el || !root.classList.contains('preloading')) {
    root.classList.remove('preloading');
    return Promise.resolve();
  }

  const medallion = el.querySelector('.preloader__medallion');
  // the header icon stays hidden until the flying medallion lands on it (no double image)
  const headerMark = document.querySelector('.site-header__mark');
  headerMark?.classList.add('is-waiting');
  const word = el.querySelector('.preloader__word');
  const target = document.querySelector('.site-header__mark img:not(.site-header__mark-night)');

  // split the word into letters, all hidden; they take no space until typed
  const text = word.dataset.word || 'AgentCollar';
  word.textContent = '';
  const letters = [...text].map((ch) => {
    const span = document.createElement('span');
    span.textContent = ch;
    span.style.display = 'none';
    word.append(span);
    return span;
  });

  const loaded = Promise.all([pageLoaded(), document.fonts?.ready]);
  const waited = Promise.race([
    Promise.all([loaded, new Promise((r) => setTimeout(r, MIN_SPIN))]),
    new Promise((r) => setTimeout(r, MAX_WAIT)),
  ]);

  return waited.then(
    () =>
      new Promise((done) => {
        // stop the CSS spin exactly where it is (CSS animates the `rotate` property),
        // hand the angle to GSAP and let it settle upright
        const angle = parseFloat(getComputedStyle(medallion).rotate) || 0;
        medallion.style.animation = 'none';
        gsap.set(medallion, { rotation: angle });

        const tl = gsap.timeline({
          onComplete: () => {
            headerMark?.classList.remove('is-waiting');
            el.remove();
            root.classList.remove('preloading');
            done();
          },
        });

        tl.to(medallion, { rotation: Math.ceil(angle / 360) * 360 || 360, duration: 0.5, ease: 'power2.out' });

        // type: one letter after another
        tl.addLabel('type', '-=0.05');
        letters.forEach((l, i) => tl.set(l, { display: 'inline' }, `type+=${i * 0.07}`));

        // hold the full name, then un-type: last letter first
        tl.addLabel('untype', `type+=${letters.length * 0.07 + 0.5}`);
        [...letters].reverse().forEach((l, i) => tl.set(l, { display: 'none' }, `untype+=${i * 0.045}`));
        // then drop the (now empty) word box entirely, so Safari repaints it clean
        tl.set(word, { display: 'none' }, `untype+=${letters.length * 0.045}`);

        // the medallion flies into the header icon while the screen fades away
        tl.addLabel('fly', `untype+=${letters.length * 0.045 + 0.1}`);
        // (distances are measured when the flight starts: by then the word is gone and the
        // medallion sits alone in the centre)
        const delta = () => {
          const from = medallion.getBoundingClientRect();
          const to = target?.getBoundingClientRect();
          if (!to || !to.width) return { x: 0, y: 0, s: 1 };
          return {
            x: to.left + to.width / 2 - (from.left + from.width / 2),
            y: to.top + to.height / 2 - (from.top + from.height / 2),
            s: to.width / from.width,
          };
        };
        let d;
        tl.add(() => (d = delta()), 'fly');
        tl.to(
          medallion,
          {
            x: () => d.x,
            y: () => d.y,
            scale: () => d.s,
            duration: 0.8,
            ease: 'power3.inOut',
            immediateRender: false,
          },
          'fly',
        );
        tl.to(el, { backgroundColor: 'rgba(240, 246, 231, 0)', duration: 0.6, ease: 'power1.in' }, 'fly+=0.3');
        // landed exactly on the header icon: swap to the real one in the same frame
        tl.add(() => {
          headerMark?.classList.remove('is-waiting');
          medallion.style.visibility = 'hidden';
        }, 'fly+=0.8');
      }),
  );
}
