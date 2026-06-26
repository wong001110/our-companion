export * from './models';
export * from './interfaces';
export const COMPANION_CHAT_RETENTION_DAYS = 7;
export const COMPANION_CHAT_CONTEXT_LIMIT = 12;
export const DEFAULT_CHARACTER_ID = 'ann';
export function nowIso() {
    return new Date().toISOString();
}
export function createId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
