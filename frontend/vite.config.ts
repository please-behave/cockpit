import { defineConfig } from 'vitest/config';

export default defineConfig({
  publicDir: false,
  build: {
    assetsInlineLimit: 0,
    rolldownOptions: {
      input: ['index.html', 'sign-in.html'],
    },
  },
  server: { fs: { allow: ['..'] } },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', '../tools/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
});
