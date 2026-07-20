import { describe, expect, it } from 'vitest';
import { detectBrowserSearchChallenge } from './browserSearchChallenge';

describe('detectBrowserSearchChallenge', () => {
  it('detects CAPTCHA challenge', () => {
    const result = detectBrowserSearchChallenge({
      url: 'https://example.com',
      title: 'Verify you are human',
      visibleText: '',
    });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('captcha');
  });

  it('detects CAPTCHA keyword', () => {
    const result = detectBrowserSearchChallenge({
      url: 'https://example.com',
      title: 'CAPTCHA verification',
      visibleText: '',
    });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('captcha');
  });

  it('detects unusual traffic rate limit', () => {
    const result = detectBrowserSearchChallenge({
      url: 'https://example.com',
      title: '',
      visibleText: 'Unusual traffic from your network',
    });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('rate_limit');
  });

  it('detects access denied', () => {
    const result = detectBrowserSearchChallenge({
      url: 'https://example.com',
      title: '',
      visibleText: 'Access denied',
    });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('access_denied');
  });

  it('detects too many requests', () => {
    const result = detectBrowserSearchChallenge({
      url: 'https://example.com',
      title: '',
      visibleText: 'Too many requests',
    });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('rate_limit');
  });

  it('detects automated queries blocked', () => {
    const result = detectBrowserSearchChallenge({
      url: 'https://example.com',
      title: '',
      visibleText: 'Automated queries blocked',
    });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('rate_limit');
  });

  it('detects 429 status', () => {
    const result = detectBrowserSearchChallenge({
      url: 'https://example.com',
      title: '429 Too Many Requests',
      visibleText: '',
    });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('rate_limit');
  });

  it('returns null for normal pages', () => {
    const result = detectBrowserSearchChallenge({
      url: 'https://html.duckduckgo.com/html/?q=test',
      title: 'test at DuckDuckGo',
      visibleText: 'Result 1: Example page about testing.',
    });
    expect(result).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(detectBrowserSearchChallenge({ url: '', title: '', visibleText: '' })).toBeNull();
  });
});
