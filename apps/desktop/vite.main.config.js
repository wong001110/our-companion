import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const nodeBuiltins = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];
export default defineConfig({
    define: {
        __dirname: 'import.meta.dirname',
        __filename: 'import.meta.filename'
    },
    resolve: {
        alias: {
            '@our-companion/shared': path.resolve(root, 'packages/shared/src/index.ts'),
            '@our-companion/character-engine': path.resolve(root, 'packages/character-engine/src/index.ts'),
            '@our-companion/memory-engine': path.resolve(root, 'packages/memory-engine/src/index.ts'),
            '@our-companion/pattern-engine': path.resolve(root, 'packages/pattern-engine/src/index.ts'),
            '@our-companion/curiosity-engine': path.resolve(root, 'packages/curiosity-engine/src/index.ts'),
            '@our-companion/discovery-engine': path.resolve(root, 'packages/discovery-engine/src/index.ts'),
            '@our-companion/insight-engine': path.resolve(root, 'packages/insight-engine/src/index.ts'),
            '@our-companion/journey-engine': path.resolve(root, 'packages/journey-engine/src/index.ts'),
            '@our-companion/diary-engine': path.resolve(root, 'packages/diary-engine/src/index.ts'),
            '@our-companion/decision-engine': path.resolve(root, 'packages/decision-engine/src/index.ts'),
            '@our-companion/tool-engine': path.resolve(root, 'packages/tool-engine/src/index.ts'),
            '@our-companion/action-engine': path.resolve(root, 'packages/action-engine/src/index.ts'),
            '@our-companion/event-bus': path.resolve(root, 'packages/platform/event-bus/src/index.ts'),
            '@our-companion/ai-engine': path.resolve(root, 'packages/ai-engine/src/index.ts'),
            '@our-companion/database': path.resolve(root, 'packages/database/src/index.ts'),
            '@our-companion/speech-engine': path.resolve(root, 'packages/speech-engine/src/index.ts')
        }
    },
    build: {
        outDir: path.resolve(__dirname, 'dist/electron/main'),
        emptyOutDir: true,
        lib: {
            entry: path.resolve(__dirname, 'electron/main/index.ts'),
            formats: ['es'],
            fileName: () => 'index.js'
        },
        rollupOptions: {
            external: ['electron', 'ffmpeg-static', '@kutalia/whisper-node-addon', 'node:sqlite', ...nodeBuiltins]
        }
    }
});
