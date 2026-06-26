import os from 'node:os';
import path from 'node:path';
/** Must match `name` in apps/desktop/package.json for Electron userData. */
export const ELECTRON_APP_NAME = '@our-companion/desktop';
export function getDefaultUserDataRoot() {
    if (process.platform === 'win32') {
        return path.join(process.env.APPDATA ?? os.homedir(), ELECTRON_APP_NAME);
    }
    if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', ELECTRON_APP_NAME);
    }
    throw new Error(`Unsupported platform: ${process.platform}. Only win32 and darwin are supported.`);
}
