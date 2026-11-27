import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  publicDir: false,
  build: {
    assetsInlineLimit: 0,
    outDir: mode === 'preview' ? '../dist/preview' : 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      input: mode === 'preview'
        ? ['index.html', 'sign-in.html', 'repository-map-preview.html']
        : ['index.html', 'sign-in.html'],
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
}));
