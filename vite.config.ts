import { defineConfig, type Plugin } from 'vite';

/** Dev server only: adds the break-ui worst-case data switch (src/dev/break-ui.ts). Never part of `vite build`. */
const breakUi: Plugin = {
  name: 'dev-break-ui',
  apply: 'serve',
  transformIndexHtml: () => [{ tag: 'script', attrs: { type: 'module' }, children: "import('/src/dev/break-ui.ts').then((m) => m.mountBreakUi());", injectTo: 'body' }],
};

// base: './' makes the build work from any sub-path, e.g. https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  plugins: [breakUi],
  // Module workers (supported by all current mobile browsers); needed because satellite.js's
  // optional WASM build uses top-level await.
  worker: { format: 'es' },
  // Second page: the standalone class clock, served at <site>/clock/.
  build: { rollupOptions: { input: { main: 'index.html', clock: 'clock/index.html' } } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as any);
