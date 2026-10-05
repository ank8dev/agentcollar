// Docs page behaviour: copy buttons, the language switcher, and the current section
// highlighted in the contents. No libraries.

const body = document.body;
const COPY = body.dataset.copy || 'copy';
const COPIED = body.dataset.copied || 'copied';

// copy buttons
for (const button of document.querySelectorAll('.copy')) {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = COPIED;
    } catch {
      // no clipboard access: select the text so ⌘C / Ctrl+C works
      const range = document.createRange();
      range.selectNodeContents(button.parentElement.querySelector('pre'));
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = '⌘C';
    }
    setTimeout(() => (button.textContent = COPY), 1400);
  });
}

// language switcher: go to the same section in the other language
const lang = document.getElementById('lang');
lang?.addEventListener('change', () => {
  location.href = new URL(lang.value, location.href).pathname + location.hash;
});

// highlight the section you are reading in the contents
const links = [...document.querySelectorAll('#toc a')];
const byId = new Map(links.map((a) => [a.hash.slice(1), a]));
const narrow = matchMedia('(max-width: 880px)');
const observer = new IntersectionObserver(
  (entries) => {
    const visible = entries.find((e) => e.isIntersecting);
    if (!visible) return;
    const link = byId.get(visible.target.id);
    if (!link) return;
    for (const a of links) a.classList.toggle('on', a === link);
    if (narrow.matches) {
      // keep the active pill in view in the horizontal bar
      link.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  },
  { rootMargin: '-20% 0px -70% 0px' },
);
for (const id of byId.keys()) {
  const target = document.getElementById(id);
  if (target) observer.observe(target);
}
