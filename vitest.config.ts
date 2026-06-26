import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = __dirname;

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts']
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json'],
    alias: {
      '@our-companion/shared': path.resolve(root, 'packages/shared/src/index.ts'),
      '@our-companion/character-engine': path.resolve(root, 'packages/character-engine/src/index.ts'),
      '@our-companion/memory-engine': path.resolve(root, 'packages/memory-engine/src/index.ts'),
      '@our-companion/discovery-engine': path.resolve(root, 'packages/discovery-engine/src/index.ts'),
      '@our-companion/journey-engine': path.resolve(root, 'packages/journey-engine/src/index.ts'),
      '@our-companion/diary-engine': path.resolve(root, 'packages/diary-engine/src/index.ts'),
      '@our-companion/tool-engine': path.resolve(root, 'packages/tool-engine/src/index.ts'),
      '@our-companion/action-engine': path.resolve(root, 'packages/action-engine/src/index.ts'),
      '@our-companion/ai-engine': path.resolve(root, 'packages/ai-engine/src/index.ts'),
      '@our-companion/database': path.resolve(root, 'packages/database/src/index.ts')
    }
  }
});
