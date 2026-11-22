import { defineConfig } from 'vitest/config';

export default defineConfig({
  publicDir: false,
  build: {
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
});
