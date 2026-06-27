import { describe, expect, it, vi } from 'vitest';
import { ExperienceEngine } from './experience-engine';

describe('ExperienceEngine', () => {
  it('captures an experience and returns it with an id', () => {
    const engine = new ExperienceEngine();
    const exp = engine.captureExperience({
      type: 'internet_discovery',
      description: 'Found a useful article about TypeScript',
      source: 'github',
    });

    expect(exp.id).toMatch(/^exp_/);
    expect(exp.type).toBe('internet_discovery');
    expect(exp.description).toBe('Found a useful article about TypeScript');
    expect(exp.occurredAt).toBeTruthy();
  });

  it('stores experiences in reverse chronological order', () => {
    const engine = new ExperienceEngine();
    const first = engine.captureExperience({
      type: 'user_conversation',
      description: 'First conversation',
      source: 'panel',
    });
    const second = engine.captureExperience({
      type: 'user_conversation',
      description: 'Second conversation',
      source: 'panel',
    });

    const all = engine.getAllExperiences();
    expect(all[0].id).toBe(second.id);
    expect(all[1].id).toBe(first.id);
  });

  it('filters experiences by type', () => {
    const engine = new ExperienceEngine();
    engine.captureExperience({ type: 'internet_discovery', description: 'Discovery 1', source: 'github' });
    engine.captureExperience({ type: 'user_conversation', description: 'Chat 1', source: 'panel' });
    engine.captureExperience({ type: 'internet_discovery', description: 'Discovery 2', source: 'reddit' });

    const discoveries = engine.listExperiences({ type: 'internet_discovery' });
    expect(discoveries).toHaveLength(2);
  });

  it('filters experiences by source text', () => {
    const engine = new ExperienceEngine();
    engine.captureExperience({ type: 'internet_discovery', description: 'Found on GitHub', source: 'github' });
    engine.captureExperience({ type: 'internet_discovery', description: 'Found on Reddit', source: 'reddit' });

    const github = engine.listExperiences({ source: 'github' });
    expect(github).toHaveLength(1);
    expect(github[0].description).toBe('Found on GitHub');
  });

  it('respects limit parameter', () => {
    const engine = new ExperienceEngine();
    for (let i = 0; i < 5; i++) {
      engine.captureExperience({ type: 'desktop_action', description: `Action ${i}`, source: 'system' });
    }

    const limited = engine.listExperiences({ limit: 3 });
    expect(limited).toHaveLength(3);
  });

  it('retrieves experience by id', () => {
    const engine = new ExperienceEngine();
    const exp = engine.captureExperience({
      type: 'reflection',
      description: 'Daily reflection',
      source: 'scheduler',
    });

    const found = engine.getExperienceById(exp.id);
    expect(found).toBeTruthy();
    expect(found!.id).toBe(exp.id);
  });

  it('returns undefined for unknown id', () => {
    const engine = new ExperienceEngine();
    expect(engine.getExperienceById('exp_nonexistent')).toBeUndefined();
  });

  it('emits experience.captured event on capture', () => {
    const engine = new ExperienceEngine();
    const handler = vi.fn();
    engine.onEvent(handler);

    const exp = engine.captureExperience({
      type: 'internet_discovery',
      description: 'Test event',
      source: 'test',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'experience.captured',
        experienceId: exp.id,
      })
    );
  });

  it('unsubscribes event handler', () => {
    const engine = new ExperienceEngine();
    const handler = vi.fn();
    const unsubscribe = engine.onEvent(handler);

    engine.captureExperience({ type: 'desktop_action', description: 'Test', source: 'test' });
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    engine.captureExperience({ type: 'desktop_action', description: 'Test 2', source: 'test' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns experience count', () => {
    const engine = new ExperienceEngine();
    expect(engine.getExperienceCount()).toBe(0);

    engine.captureExperience({ type: 'internet_discovery', description: 'Test', source: 'test' });
    expect(engine.getExperienceCount()).toBe(1);
  });
});
