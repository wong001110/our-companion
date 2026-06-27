import type { OurCompanionApi } from '@our-companion/shared';
import type { DiscoveryQueueManager } from './companion/DiscoveryQueueManager';

declare global {
  interface Window {
    ourCompanion: OurCompanionApi;
    __discoveryQueue?: DiscoveryQueueManager;
  }
}

export {};
