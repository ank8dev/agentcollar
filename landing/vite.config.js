import { defineConfig } from 'vite';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Pages: the landing, plus every generated docs page (docs/index.html, docs/<lang>/index.html).
const docsPages = Object.fromEntries(
  [['docs', resolve(__dirname, 'docs/index.html')]]
    .concat(
      readdirSync(resolve(__dirname, 'docs'), { withFileTypes: true })
        .filter((d) => d.isDirectory() && existsSync(resolve(__dirname, 'docs', d.name, 'index.html')))
        .map((d) => [`docs-${d.name}`, resolve(__dirname, 'docs', d.name, 'index.html')]),
    )
    .filter(([, file]) => existsSync(file)),
);

export default defineConfig({
  // The site lives at https://ank8dev.github.io/agentcollar/,
  // so every built link must start with /agentcollar/.
  base: '/agentcollar/',

  // Drawings and logos live next door in ../brand (shared by the whole project),
  // so the dev server must be allowed to read the parent folder.
  server: {
    fs: { allow: ['..'] },
  },

  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), ...docsPages },
    },
  },
});
