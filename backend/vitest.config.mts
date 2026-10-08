import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
  },
  plugins: [
    // Compila los decoradores de Nest en los tests igual que SWC en runtime.
    swc.vite({ module: { type: 'es6' } }),
  ],
});
