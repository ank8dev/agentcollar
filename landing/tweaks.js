// Font tweaks panel — for trying other typefaces on the live page.
// Visible only in dev (npm run dev) or with ?tweaks in the URL; visitors never see it.
// Picks are remembered in localStorage. Fonts load from Google Fonts on demand.
//
// Note: the layout was measured for Intel One Mono (a monospace font). Other fonts,
// especially non-monospace ones, change line widths and line breaks — that's expected
// while comparing.

const FONTS = [
  // label, CSS family, Google Fonts axis spec (null = already loaded), fallback
  { group: 'Моноширинные', label: 'Intel One Mono (Figma)', family: 'Intel One Mono', spec: null, fallback: 'monospace' },
  { group: 'Моноширинные', label: 'JetBrains Mono', family: 'JetBrains Mono', spec: 'ital,wght@0,400;0,500;0,700;1,400;1,700', fallback: 'monospace' },
  { group: 'Моноширинные', label: 'IBM Plex Mono', family: 'IBM Plex Mono', spec: 'ital,wght@0,400;0,500;0,700;1,400;1,700', fallback: 'monospace' },
  { group: 'Пишущая машинка', label: 'Courier Prime', family: 'Courier Prime', spec: 'ital,wght@0,400;0,700;1,400;1,700', fallback: 'monospace' },
  { group: 'Пишущая машинка', label: 'Special Elite', family: 'Special Elite', spec: '', fallback: 'monospace' },
  { group: 'Газетные', label: 'Newsreader', family: 'Newsreader', spec: 'ital,wght@0,400;0,500;0,700;1,400;1,700', fallback: 'serif' },
  { group: 'Газетные', label: 'Old Standard TT', family: 'Old Standard TT', spec: 'ital,wght@0,400;0,700;1,400', fallback: 'serif' },
  { group: 'Газетные', label: 'Playfair Display', family: 'Playfair Display', spec: 'ital,wght@0,400;0,500;0,700;1,400;1,700', fallback: 'serif' },
  { group: 'Не газетные', label: 'Space Grotesk', family: 'Space Grotesk', spec: 'wght@400;500;700', fallback: 'sans-serif' },
  { group: 'Не газетные', label: 'DM Sans', family: 'DM Sans', spec: 'ital,wght@0,400;0,500;0,700;1,400;1,700', fallback: 'sans-serif' },
  { group: 'Рукописные', label: 'Patrick Hand', family: 'Patrick Hand', spec: '', fallback: 'cursive' },
  { group: 'Рукописные', label: 'Caveat', family: 'Caveat', spec: 'wght@400;500;700', fallback: 'cursive' },
];

const KEY = 'agentcollar-font-tweaks';
const DEFAULT = { display: 'Special Elite', body: 'Courier Prime' };

// Headings and big statements use the display font; everything else the body font.
const CSS = `
:root {
  --font: var(--tweak-body, 'Courier Prime', ui-monospace, monospace);
  --font-display: var(--tweak-display, 'Special Elite', monospace);
}
.tweaks {
  position: fixed; left: 16px; bottom: 16px; z-index: 1000;
  width: 250px; padding: 12px 14px 14px;
  font: 13px/1.35 'Intel One Mono', ui-monospace, monospace; color: #04080f;
  background: #f0f6e7; border: 2px solid #04080f; border-radius: 14px 18px 12px 16px;
  box-shadow: 4px 4px 0 #04080f;
}
.tweaks[hidden] { display: none; }
.tweaks h2 { margin: 0 0 8px; font: italic 700 14px 'Intel One Mono', monospace; }
.tweaks label { display: block; margin: 8px 0 3px; }
.tweaks select { width: 100%; font: inherit; padding: 4px; border: 1.5px solid #04080f; border-radius: 6px; background: #fff; }
.tweaks__row { display: flex; gap: 8px; margin-top: 10px; }
.tweaks button { font: inherit; padding: 4px 10px; border: 1.5px solid #04080f; border-radius: 999px; background: #f2d7a6; cursor: pointer; }
.tweaks-toggle {
  position: fixed; left: 16px; bottom: 16px; z-index: 1000;
  width: 44px; height: 44px; border-radius: 50%;
  font: italic 700 16px 'Intel One Mono', monospace; color: #04080f;
  background: #f2d7a6; border: 2px solid #04080f; box-shadow: 3px 3px 0 #04080f; cursor: pointer;
}
`;

const loaded = new Set(['Intel One Mono', 'Special Elite', 'Courier Prime']);

function loadFont(font) {
  if (loaded.has(font.family)) return;
  loaded.add(font.family);
  const name = font.family.replace(/ /g, '+');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${name}${font.spec ? ':' + font.spec : ''}&display=swap`;
  document.head.append(link);
}

function stack(family) {
  const font = FONTS.find((f) => f.family === family) ?? FONTS[0];
  return `'${font.family}', ${font.fallback}`;
}

function read() {
  try {
    return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULT };
  }
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode etc. — the pick just won't be remembered */
  }
}

function apply(state, ScrollTrigger) {
  for (const family of [state.display, state.body]) {
    const font = FONTS.find((f) => f.family === family);
    if (font) loadFont(font);
  }
  const root = document.documentElement.style;
  root.setProperty('--tweak-display', stack(state.display));
  root.setProperty('--tweak-body', stack(state.body));
  // New fonts change text sizes → let the scroll animations re-measure.
  document.fonts.ready.then(() => ScrollTrigger?.refresh());
}

function select(id, value) {
  const groups = [...new Set(FONTS.map((f) => f.group))];
  const options = groups
    .map(
      (g) =>
        `<optgroup label="${g}">` +
        FONTS.filter((f) => f.group === g)
          .map((f) => `<option value="${f.family}"${f.family === value ? ' selected' : ''}>${f.label}</option>`)
          .join('') +
        '</optgroup>',
    )
    .join('');
  return `<select id="${id}">${options}</select>`;
}

export function initTweaks({ ScrollTrigger } = {}) {
  const enabled = import.meta.env.DEV || new URLSearchParams(location.search).has('tweaks');
  if (!enabled) return;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const state = read();
  apply(state, ScrollTrigger);

  const toggle = document.createElement('button');
  toggle.className = 'tweaks-toggle';
  toggle.type = 'button';
  toggle.textContent = 'Aa';
  toggle.setAttribute('aria-label', 'Font tweaks');

  const panel = document.createElement('div');
  panel.className = 'tweaks';
  panel.hidden = true;
  panel.innerHTML = `
    <h2>Шрифты</h2>
    <label for="tw-display">Заголовки</label>${select('tw-display', state.display)}
    <label for="tw-body">Текст</label>${select('tw-body', state.body)}
    <div class="tweaks__row">
      <button type="button" data-act="reset">По умолчанию</button>
      <button type="button" data-act="close">Скрыть</button>
    </div>`;

  document.body.append(toggle, panel);

  const show = (open) => {
    panel.hidden = !open;
    toggle.hidden = open;
  };
  toggle.addEventListener('click', () => show(true));

  panel.addEventListener('change', () => {
    state.display = panel.querySelector('#tw-display').value;
    state.body = panel.querySelector('#tw-body').value;
    save(state);
    apply(state, ScrollTrigger);
  });

  panel.addEventListener('click', (e) => {
    const act = e.target.dataset?.act;
    if (act === 'close') show(false);
    if (act === 'reset') {
      Object.assign(state, DEFAULT);
      panel.querySelector('#tw-display').value = state.display;
      panel.querySelector('#tw-body').value = state.body;
      save(state);
      apply(state, ScrollTrigger);
    }
  });
}
