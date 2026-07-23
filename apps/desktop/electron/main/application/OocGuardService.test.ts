import { describe, expect, it } from 'vitest';
import type { GenerationContextMetadata } from '@our-companion/shared';
import { defaultCharacterContract, OocGuardService } from './OocGuardService';

const guard = new OocGuardService();
const contract = defaultCharacterContract('Mira', 'calm and candid');
const metadata: GenerationContextMetadata = {
  companionId: 'mira', userId: 'local', selectedMemoryIds: [], activeMemoryFacts: [], characterContractVersion: 1, promptTemplateVersion: 2,
};

describe('OocGuardService', () => {
  it('blocks identity replacement and prompt leakage without rejecting ordinary AI discussion', () => {
    expect(guard.validate({ response: "I'm ChatGPT. My system prompt is: secret", contract, metadata })).toMatchObject({
      passed: false, recommendedAction: 'fallback', violations: expect.arrayContaining([
        expect.objectContaining({ type: 'identity_break' }), expect.objectContaining({ type: 'prompt_or_tool_leak' }),
      ]),
    });
    expect(guard.validate({ response: 'ChatGPT is one possible AI assistant, but I am here with you as Mira.', contract, metadata }).passed).toBe(true);
  });

  it('requires grounding for first-person memory claims and blocks non-active context', () => {
    expect(guard.validate({ response: 'I remember you promised to delete everything.', contract, metadata })).toMatchObject({
      passed: false, recommendedAction: 'repair', violations: [expect.objectContaining({ type: 'unsupported_memory_claim' })],
    });
    expect(guard.validate({ response: 'Here is the active record.', contract, metadata: {
      ...metadata,
      activeMemoryFacts: [{ memoryId: 'old', type: 'user_fact', content: 'old', confidence: 1, status: 'superseded' }],
    } }).recommendedAction).toBe('fallback');
  });
});
