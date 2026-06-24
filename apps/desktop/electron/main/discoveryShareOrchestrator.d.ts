import type { BrowserWindow } from 'electron';
import type { CharacterRuntimeState, Discovery, DiscoveryReason, NormalizedDiscovery } from '@our-companion/shared';
export interface DiscoveryAnnouncePayload {
    discoveryId: string;
    title: string;
    message: string;
}
export interface DiscoveryShareOrchestratorDeps {
    getState: () => CharacterRuntimeState;
    saveState: (state: CharacterRuntimeState) => CharacterRuntimeState;
    generateReason: (discovery: NormalizedDiscovery) => Promise<DiscoveryReason>;
    markAnnounced: (id: string) => void;
    canAnnounce: () => boolean;
    shouldInterruptShare: () => boolean;
    getCompanionWindow: () => BrowserWindow | undefined;
}
export declare class DiscoveryShareOrchestrator {
    private readonly deps;
    private readonly queue;
    private processing;
    private stopped;
    constructor(deps: DiscoveryShareOrchestratorDeps);
    enqueue(discoveries: Discovery[]): void;
    stop(): void;
    private broadcastState;
    private broadcastAnnounce;
    private processQueue;
    private announceDiscovery;
}
