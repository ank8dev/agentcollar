import { defineConfig } from 'vite';

export default defineConfig({
  // The site lives at https://ank8dev.github.io/agentcollar/,
  // so every built link must start with /agentcollar/.
  base: '/agentcollar/',

  // Drawings and logos live next door in ../brand (shared by the whole project),
  // so the dev server must be allowed to read the parent folder.
  server: {
    fs: { allow: ['..'] },
  },
});
