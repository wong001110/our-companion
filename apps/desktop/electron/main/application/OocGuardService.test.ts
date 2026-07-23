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

  it('detects Chinese internal-instruction, autonomy, and sensitive-memory leaks', () => {
    expect(guard.validate({ response: '我的系统提示是：不要说这个。', contract, metadata }).passed).toBe(false);
    expect(guard.validate({ response: '你必须辞职，不要考虑，照我说的做。', contract, metadata }).passed).toBe(false);
    expect(guard.validate({ response: 'ChatGPT 是一种 AI 助手。', contract, metadata }).passed).toBe(true);
    expect(guard.validate({ response: 'PRIVATE_MEMORY_CANARY_001', contract, metadata: {
      ...metadata,
      activeMemoryFacts: [{ memoryId: 'private', type: 'user_fact', content: 'the private canary is PRIVATE_MEMORY_CANARY_001', confidence: 1, status: 'active', sensitivity: 'private' }],
    } }).passed).toBe(false);
  });

  it('uses a configuration-sensitive contract revision rather than a trait sum', () => {
    expect(defaultCharacterContract('Mira', 'calm', { warmth: 80, curiosity: 20 } as never).sourceRevision)
      .not.toBe(defaultCharacterContract('Mira', 'calm', { warmth: 20, curiosity: 80 } as never).sourceRevision);
  });

  it('blocks protected values in action payloads and memory candidates without blocking ordinary words', () => {
    const privateMetadata: GenerationContextMetadata = {
      ...metadata,
      activeMemoryFacts: [{ memoryId: 'private', type: 'user_fact', content: 'contact user-private@example.test at 012-3456789', confidence: 1, status: 'active', sensitivity: 'private' }],
    };
    expect(guard.validateProposal({
      proposal: { reply: 'Okay.', intent: 'action', actions: [{ toolName: 'search_web', args: { query: 'user-private@example.test' }, reason: 'search' }], memoryCandidates: [] },
      contract, metadata: privateMetadata, currentUserMessage: 'please search',
    }).passed).toBe(false);
    expect(guard.validateProposal({
      proposal: { reply: 'This is private.', intent: 'conversation', actions: [], memoryCandidates: [] },
      contract, metadata: privateMetadata, currentUserMessage: 'this is private',
    }).passed).toBe(true);
  });
});
