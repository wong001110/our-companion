import { describe, expect, it } from 'vitest';
import {
  getConfiguredModel,
  normalizeDeepSeekEndpoint,
  normalizeDeepSeekModel,
  validateCognitiveInsight,
  validateCuriosityAssessment,
  validateDecision,
  validateDiscoveryUnderstanding,
  validateDiscoveryReason,
  validateMemorySummary,
  validateActionPlan,
  validateCompanionTurnProposal,
  validateToolIntent
} from './index';

describe('ai engine', () => {
  it('uses configurable model with API default', () => {
    expect(getConfiguredModel({})).toBe('deepseek-v4-flash');
    expect(getConfiguredModel({ DEEPSEEK_MODEL: 'custom-model' })).toBe('custom-model');
  });

  it('normalizes DeepSeek model display aliases and endpoints', () => {
    expect(normalizeDeepSeekModel('DeepSeek V4 Flash')).toBe('deepseek-v4-flash');
    expect(normalizeDeepSeekEndpoint('https://api.deepseek.com')).toBe('https://api.deepseek.com/chat/completions');
    expect(normalizeDeepSeekEndpoint('https://api.deepseek.com/chat/completions')).toBe(
      'https://api.deepseek.com/chat/completions'
    );
  });

  it('validates discovery reason JSON', () => {
    const parsed = validateDiscoveryReason(
      '{"why_this_matters":"Useful","recommended_action":"view","short_message":"Look","tags":["ux"]}'
    );
    expect(parsed.recommended_action).toBe('view');
  });

  it('validates discovery reason with card fields', () => {
    const parsed = validateDiscoveryReason(
      '{"why_this_matters":"Useful","recommended_action":"save","short_message":"Worth keeping.","card_title":"Local-first patterns","card_body":"SQLite tools for personal memory.","tags":["sqlite"]}'
    );
    expect(parsed.card_title).toBe('Local-first patterns');
    expect(parsed.card_body).toBe('SQLite tools for personal memory.');
  });

  it('handles discovery reason without card fields', () => {
    const parsed = validateDiscoveryReason(
      '{"why_this_matters":"Useful","recommended_action":"view","short_message":"Look","tags":["ux"]}'
    );
    expect(parsed.card_title).toBeUndefined();
    expect(parsed.card_body).toBeUndefined();
  });

  it('validates memory summary JSON', () => {
    const parsed = validateMemorySummary('{"type":"topic","title":"PixiJS","summary":"Notes","importance_score":50}');
    expect(parsed.type).toBe('topic');
  });

  it('validates tool intent JSON', () => {
    const parsed = validateToolIntent(
      '{"tool_name":"search_web","args":{"query":"PixiJS"},"requires_confirmation":false,"user_facing_summary":"Search"}'
    );
    expect(parsed.tool_name).toBe('search_web');
  });

  it('strictly validates a structured Companion turn and safely extracts wrapper JSON', () => {
    const proposal = validateCompanionTurnProposal(
      'Result:\n{"replySegments":[{"segmentId":"answer","text":"I can help.","provenance":"current_turn"}],"intent":"conversation_and_action","actions":[{"toolName":"search_web","args":{"query":"PixiJS"},"reason":"The user asked."}],"memoryCandidates":[{"type":"goal","summary":"build Our Companion","evidence":"My goal is build Our Companion","confidence":0.9}]}'
    );
    expect(proposal?.actions[0].toolName).toBe('search_web');
    expect(proposal?.memoryCandidates[0].type).toBe('goal');
  });

  it('rejects malformed, over-permissive, or internally inconsistent turn proposals', () => {
    expect(validateCompanionTurnProposal('not json')).toBeUndefined();
    expect(validateCompanionTurnProposal(
      '{"replySegments":[{"segmentId":"x","text":"x","provenance":"current_turn"}],"intent":"conversation","actions":[{"toolName":"open_url","args":{"url":"example.com"},"reason":"x"}],"memoryCandidates":[]}'
    )).toBeUndefined();
    expect(validateCompanionTurnProposal(
      '{"replySegments":[{"segmentId":"x","text":"x","provenance":"current_turn"}],"intent":"conversation","actions":[],"memoryCandidates":[],"internalEvent":"arbitrary"}'
    )).toBeUndefined();
  });

  it('requires strict reply-segment provenance and rejects the legacy reply contract', () => {
    const base = '{"replySegments":[{"segmentId":"one","text":"Hello","provenance":"current_turn"}],"intent":"conversation","actions":[],"memoryCandidates":[]}';
    expect(validateCompanionTurnProposal(base)?.replySegments).toHaveLength(1);
    expect(validateCompanionTurnProposal('{"reply":"Hello","groundedClaims":[],"intent":"conversation","actions":[],"memoryCandidates":[]}')).toBeUndefined();
    expect(validateCompanionTurnProposal('{"replySegments":[{"segmentId":"one","text":"Memory","provenance":"memory"}],"intent":"conversation","actions":[],"memoryCandidates":[]}')).toBeUndefined();
    expect(validateCompanionTurnProposal('{"replySegments":[{"segmentId":"one","text":"Hello","provenance":"current_turn","supportingMemoryId":"memory-1"}],"intent":"conversation","actions":[],"memoryCandidates":[]}')).toBeUndefined();
    expect(validateCompanionTurnProposal('{"replySegments":[{"segmentId":"one","text":"Memory","provenance":"memory","supportingMemoryId":"memory-1"},{"segmentId":"one","text":"Again","provenance":"current_turn"}],"intent":"conversation","actions":[],"memoryCandidates":[]}')).toBeUndefined();
    expect(validateCompanionTurnProposal(JSON.stringify({ replySegments: [{ segmentId: 'long', text: 'x'.repeat(4_001), provenance: 'current_turn' }], intent: 'conversation', actions: [], memoryCandidates: [] }))).toBeUndefined();
  });

  it('validates and normalizes registry-backed action plans from the live snake-case prompt contract', () => {
    const plan = validateActionPlan(
      '{"summary":"Open docs","steps":[{"tool_name":"open_url","args":{"url":"docs.example.com"},"required_scopes":[]}],"requires_confirmation":false}'
    );
    expect(plan?.steps[0]).toMatchObject({
      toolName: 'open_url',
      args: { url: 'https://docs.example.com' },
      requiredScopes: ['browser'],
    });
    expect(plan?.requiredPermissions).toEqual(['browser']);
  });

  it('blocks unknown tools, invalid arguments, and unsafe navigation URLs', () => {
    expect(validateActionPlan(
      '{"steps":[{"toolName":"run_shell","args":{}}],"confirmationRequired":false}'
    )).toBeUndefined();
    expect(() => validateToolIntent(
      '{"tool_name":"search_web","args":{},"requires_confirmation":false,"user_facing_summary":"Search"}'
    )).toThrow();
    expect(validateActionPlan(
      '{"steps":[{"toolName":"browser_navigation","args":{"action":"open_tab","url":"file:///tmp/a"}}],"confirmationRequired":true}'
    )).toBeUndefined();
  });

  it('validates cognitive JSON contracts', () => {
    expect(
      validateDiscoveryUnderstanding(
        '{"summary":"Useful","concepts":["memory"],"entities":["SQLite"],"tags":["local-first"],"growth_value":82,"confidence":0.8,"reason":"Relevant"}'
      ).growth_value
    ).toBe(82);
    expect(
      validateCognitiveInsight(
        '{"category":"learning","title":"Memory direction","summary":"A summary","explanation":"It matters","supportingPatternIds":["p1"],"confidence":0.82,"importance":0.88,"novelty":0.7}'
      ).supportingPatternIds
    ).toContain('p1');
    expect(
      validateCuriosityAssessment(
        '{"target_id":"disc_1","target_type":"discovery","growth_value":77,"budget_cost":7,"reason":"Good fit"}'
      ).targetId
    ).toBe('disc_1');
    expect(validateDecision('{"action":"stay_silent","timing":"next_idle","priority":"normal","reason":"Focused"}').action).toBe(
      'stay_silent'
    );
  });
});
