import { describe, expect, it } from 'vitest';
import {
  ACTION_CAPABILITY_REGISTRY,
  actionCapabilityPromptSummary,
  getActionCapability,
  listEnabledActionCapabilities,
  normalizeActionUrl,
  validateActionCapabilityArgs,
} from './index';

describe('Action capability registry', () => {
  it('is the canonical enabled capability and prompt source', () => {
    expect(listEnabledActionCapabilities().map((entry) => entry.toolName)).toEqual(Object.keys(ACTION_CAPABILITY_REGISTRY));
    expect(actionCapabilityPromptSummary()).toContain('Tool: open_url');
    expect(actionCapabilityPromptSummary()).toContain('Allowed arguments: url:string (required)');
    expect(actionCapabilityPromptSummary()).toContain('Unavailable capabilities: none');
    expect(getActionCapability('run_shell')).toBeUndefined();
  });

  it.each([
    ['youtube.com', 'https://youtube.com'],
    ['www.youtube.com', 'https://www.youtube.com'],
    ['https://Docs.Example.co.uk/path', 'https://docs.example.co.uk/path'],
  ])('normalizes public URL %s', (input, expected) => {
    expect(normalizeActionUrl(input)).toBe(expected);
  });

  it.each([
    'javascript:alert(1)',
    'file:///tmp/a',
    'https://user:pass@example.com',
    'http://localhost:3000',
    'http://127.0.0.1',
    'http://10.0.0.2',
    'hello world',
  ])('rejects unsafe URL %s', (input) => {
    expect(normalizeActionUrl(input)).toBeUndefined();
  });

  it('validates and normalizes arguments from the same registry', () => {
    expect(validateActionCapabilityArgs('open_url', { url: 'youtube.com' })).toEqual({
      ok: true,
      args: { url: 'https://youtube.com' },
    });
    expect(validateActionCapabilityArgs('search_web', { query: ' PixiJS ' })).toEqual({
      ok: true,
      args: { query: 'PixiJS' },
    });
    expect(validateActionCapabilityArgs('run_shell', {})).toEqual({
      ok: false,
      reason: 'ACTION_CAPABILITY_NOT_AVAILABLE',
    });
  });
});
