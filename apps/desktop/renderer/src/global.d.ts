import type { OurCompanionApi } from '@our-companion/shared';

declare global {
  interface Window {
    ourCompanion: OurCompanionApi;
  }
}

export {};
