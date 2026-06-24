import path from 'node:path';
import { defineConfig } from 'vite';
export default defineConfig({
    resolve: {
        alias: {
            '@our-companion/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts')
        }
    },
    build: {
        outDir: path.resolve(__dirname, 'dist/electron/preload'),
        emptyOutDir: true,
        lib: {
            entry: path.resolve(__dirname, 'electron/preload/index.ts'),
            formats: ['cjs'],
            fileName: () => 'index.cjs'
        },
        rollupOptions: {
            external: ['electron']
        }
    }
});
