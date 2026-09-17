import { defineConfig } from 'vite';

// Served from https://<user>.github.io/spiders-animation/ on GitHub Pages,
// so assets need to resolve under that subpath rather than the domain root.
export default defineConfig({
  base: '/spiders-animation/',
  server: {
    host: true,
  },
  build: {
    target: 'esnext',
  },
});
