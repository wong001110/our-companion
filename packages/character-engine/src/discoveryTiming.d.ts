export declare function getDiscoveryFetchDelayRange(discoveryScore: number): {
    minMs: number;
    maxMs: number;
};
export declare function getDiscoveryFetchDelay(discoveryScore: number, random?: () => number): number;
export declare const DISCOVERY_STARTUP_DELAY_MS = 90000;
