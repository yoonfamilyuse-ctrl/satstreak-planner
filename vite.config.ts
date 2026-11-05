import { defineConfig } from 'vite';

// base: './' makes the build work from any sub-path, e.g. https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  // Module workers (supported by all current mobile browsers); needed because satellite.js's
  // optional WASM build uses top-level await.
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as any);
