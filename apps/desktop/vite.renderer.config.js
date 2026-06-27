import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    base: './',
    root: path.resolve(__dirname, 'renderer'),
    plugins: [react()],
    resolve: {
        alias: {
            '@our-companion/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts')
        }
    },
    build: {
        outDir: path.resolve(__dirname, 'dist/renderer'),
        emptyOutDir: true
    }
});
