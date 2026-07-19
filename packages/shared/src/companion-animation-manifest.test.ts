import { describe, expect, it } from 'vitest';
import {
  COMPANION_ANIMATION_MANIFEST,
  COMPANION_ANIMATION_MANIFEST_BY_NAME,
  COMPANION_ANIMATION_NAMES,
  type CompanionAnimationName,
} from './index';

const EXPECTED_NAMES = [
  'Idle_Neutral', 'Idle_Breathe', 'Idle_Sleepy', 'Idle_Sleeping', 'Walk_Right', 'Walk_Left',
  'Expedition_Return', 'Think', 'Work_Focus', 'Expedition_Present', 'Talk_Neutral', 'Talk_Happy',
  'Expedition_Prepare', 'Expedition_Leave', 'Listening', 'Waiting_Response', 'Drag_Hold',
  'Drag_Release', 'Talk_Thinking', 'Talk_Concerned', 'Walk_Up', 'Walk_Down', 'Walk_UpLeft',
  'Walk_UpRight', 'Walk_DownLeft', 'Walk_DownRight', 'Enter', 'Leave', 'Music_Idle',
] as const;

const EXPECTED_REQUIRED_FOR_CREATION = [
  'Idle_Neutral',
  'Walk_Right', 'Walk_Left', 'Walk_Up', 'Walk_Down',
  'Walk_UpLeft', 'Walk_UpRight', 'Walk_DownLeft', 'Walk_DownRight',
  'Enter', 'Leave',
  'Talk_Neutral', 'Listening',
  'Drag_Hold', 'Drag_Release',
] as const;

const EXPECTED_REQUIRED_FOR_NETWORK_VISITOR = ['Idle_Neutral', 'Enter', 'Leave'] as const;

function fallbackChain(start: CompanionAnimationName): CompanionAnimationName[] {
  const chain = [start];
  const visited = new Set<CompanionAnimationName>();
  let current = start;
  while (current !== 'Idle_Neutral') {
    if (visited.has(current)) throw new Error(`Fallback cycle at ${current}`);
    visited.add(current);
    current = COMPANION_ANIMATION_MANIFEST_BY_NAME[current].fallback;
    chain.push(current);
  }
  return chain;
}

describe('Companion animation manifest contract', () => {
  it('keeps the exact 29-name contract', () => {
    expect(COMPANION_ANIMATION_NAMES).toEqual(EXPECTED_NAMES);
    expect(COMPANION_ANIMATION_MANIFEST.map((entry) => entry.key)).toEqual(EXPECTED_NAMES);
    expect(new Set(COMPANION_ANIMATION_NAMES).size).toBe(29);
  });

  it('keeps the exact explicit creation-required set', () => {
    const actual = COMPANION_ANIMATION_MANIFEST.filter((entry) => entry.requiredForCreation).map((entry) => entry.key);
    expect(actual).toHaveLength(EXPECTED_REQUIRED_FOR_CREATION.length);
    expect(new Set(actual)).toEqual(new Set(EXPECTED_REQUIRED_FOR_CREATION));
  });

  it('keeps the exact Network visitor-required set', () => {
    expect(COMPANION_ANIMATION_MANIFEST.filter((entry) => entry.requiredForNetworkVisitor).map((entry) => entry.key))
      .toEqual(EXPECTED_REQUIRED_FOR_NETWORK_VISITOR);
  });

  it('keeps the requested semantic fallback chains', () => {
    expect(fallbackChain('Talk_Happy')).toEqual(['Talk_Happy', 'Talk_Neutral', 'Idle_Neutral']);
    expect(fallbackChain('Talk_Thinking')).toEqual(['Talk_Thinking', 'Talk_Neutral', 'Idle_Neutral']);
    expect(fallbackChain('Talk_Concerned')).toEqual(['Talk_Concerned', 'Talk_Neutral', 'Idle_Neutral']);
    expect(fallbackChain('Expedition_Present')).toEqual(['Expedition_Present', 'Talk_Neutral', 'Idle_Neutral']);

    for (const name of ['Idle_Breathe', 'Idle_Sleepy', 'Music_Idle', 'Waiting_Response'] as const) {
      expect(fallbackChain(name)).toEqual([name, 'Idle_Neutral']);
    }
    for (const name of ['Expedition_Prepare', 'Expedition_Leave', 'Expedition_Return'] as const) {
      expect(fallbackChain(name)).toEqual([name, 'Idle_Neutral']);
    }

    expect(fallbackChain('Walk_UpLeft')).toEqual(['Walk_UpLeft', 'Walk_Left', 'Idle_Neutral']);
    expect(fallbackChain('Walk_DownLeft')).toEqual(['Walk_DownLeft', 'Walk_Left', 'Idle_Neutral']);
    expect(fallbackChain('Walk_UpRight')).toEqual(['Walk_UpRight', 'Walk_Right', 'Idle_Neutral']);
    expect(fallbackChain('Walk_DownRight')).toEqual(['Walk_DownRight', 'Walk_Right', 'Idle_Neutral']);
    for (const name of ['Walk_Left', 'Walk_Right', 'Walk_Up', 'Walk_Down'] as const) {
      expect(fallbackChain(name)).toEqual([name, 'Idle_Neutral']);
    }
  });

  it('keeps every fallback in the manifest and every chain terminating safely', () => {
    for (const entry of COMPANION_ANIMATION_MANIFEST) {
      expect(COMPANION_ANIMATION_MANIFEST_BY_NAME[entry.fallback]).toBeDefined();
      expect(fallbackChain(entry.key).at(-1)).toBe('Idle_Neutral');
    }
  });
});
