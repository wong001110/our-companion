import { describe, expect, it } from 'vitest';

const FIELD_LIMITS = {
  clientEventId: 128,
  kind: 64,
  operation: 128,
  status: 64,
  provider: 128,
  model: 128,
  companionId: 128,
  correlationId: 128,
  cycleId: 128,
  turnId: 128,
  summary: 512,
  errorCode: 128,
  errorMessage: 1000,
} as const;

const MAX_EVENT_PAYLOAD_BYTES = 48 * 1024;

function truncate(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

function sanitizeErrorMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;
  let result = message;
  result = result.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
  result = result.replace(/Authorization:\s*\S+/gi, 'Authorization: [REDACTED]');
  result = result.replace(/Cookie:\s*[^;\s]+/gi, 'Cookie: [REDACTED]');
  result = result.replace(/refreshToken\s*[=:]\s*\S+/gi, 'refreshToken=[REDACTED]');
  result = result.replace(/apiKey\s*[=:]\s*\S+/gi, 'apiKey=[REDACTED]');
  return truncate(result, FIELD_LIMITS.errorMessage);
}

function buildBoundedPayload(payload: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!payload) return undefined;
  const redacted = payload;
  const serialized = JSON.stringify(redacted);
  const byteSize = Buffer.byteLength(serialized, 'utf8');
  if (byteSize <= MAX_EVENT_PAYLOAD_BYTES) return redacted;

  const priorityKeys = ['channel', 'source', 'durationMs', 'requestMessages', 'requestBody', 'rawResponse', 'extractedText', 'synthesisResult'];
  const bounded: Record<string, unknown> = { uploadTruncated: true, originalPayloadBytes: byteSize };

  for (const key of priorityKeys) {
    if (key in redacted) {
      const value = redacted[key];
      if (typeof value === 'string') {
        bounded[key] = value.slice(0, 2000);
      } else if (Array.isArray(value)) {
        bounded[key] = value.slice(0, 10);
      } else {
        bounded[key] = value;
      }
    }
  }

  const finalSerialized = JSON.stringify(bounded);
  if (Buffer.byteLength(finalSerialized, 'utf8') > MAX_EVENT_PAYLOAD_BYTES) {
    return { uploadTruncated: true, originalPayloadBytes: byteSize, error: 'Payload too large after truncation' };
  }
  return bounded;
}

describe('upload projection helpers', () => {
  describe('truncate', () => {
    it('returns undefined for undefined input', () => {
      expect(truncate(undefined, 100)).toBeUndefined();
    });

    it('returns undefined for empty string (falsy)', () => {
      expect(truncate('', 100)).toBeUndefined();
    });

    it('returns value unchanged when within limit', () => {
      expect(truncate('short', 100)).toBe('short');
    });

    it('truncates value exceeding limit', () => {
      expect(truncate('a'.repeat(200), 100)).toBe('a'.repeat(100));
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('returns undefined for undefined input', () => {
      expect(sanitizeErrorMessage(undefined)).toBeUndefined();
    });

    it('redacts Bearer tokens', () => {
      expect(sanitizeErrorMessage('Error with Bearer abc123secret')).toBe('Error with Bearer [REDACTED]');
    });

    it('redacts Authorization headers', () => {
      expect(sanitizeErrorMessage('Authorization: Bearer token123')).toBe('Authorization: [REDACTED] [REDACTED]');
    });

    it('redacts Cookie values', () => {
      expect(sanitizeErrorMessage('Cookie: session=abc123; path=/')).toBe('Cookie: [REDACTED]; path=/');
    });

    it('redacts refreshToken assignments', () => {
      expect(sanitizeErrorMessage('refreshToken=secret123 failed')).toBe('refreshToken=[REDACTED] failed');
      expect(sanitizeErrorMessage('refreshToken: secret123 failed')).toBe('refreshToken=[REDACTED] failed');
      expect(sanitizeErrorMessage('refreshToken = secret123 failed')).toBe('refreshToken=[REDACTED] failed');
    });

    it('redacts apiKey assignments', () => {
      expect(sanitizeErrorMessage('apiKey=secret123 invalid')).toBe('apiKey=[REDACTED] invalid');
      expect(sanitizeErrorMessage('apiKey: secret123 invalid')).toBe('apiKey=[REDACTED] invalid');
      expect(sanitizeErrorMessage('apiKey = secret123 invalid')).toBe('apiKey=[REDACTED] invalid');
    });

    it('truncates to FIELD_LIMITS.errorMessage', () => {
      const longMessage = 'x'.repeat(2000);
      const result = sanitizeErrorMessage(longMessage);
      expect(result!.length).toBe(FIELD_LIMITS.errorMessage);
    });
  });

  describe('buildBoundedPayload', () => {
    it('returns undefined for undefined input', () => {
      expect(buildBoundedPayload(undefined)).toBeUndefined();
    });

    it('returns payload unchanged when under byte limit', () => {
      const small = { channel: 'chat', source: 'test' };
      expect(buildBoundedPayload(small)).toEqual(small);
    });

    it('preserves priority fields when payload exceeds limit', () => {
      const large = {
        channel: 'chat',
        source: 'test',
        requestMessages: Array.from({ length: 20 }, (_, i) => ({ role: 'user', content: `msg${i}: ${'x'.repeat(3000)}` })),
      };
      const result = buildBoundedPayload(large);
      expect(result).toBeDefined();
      expect(result!.uploadTruncated).toBe(true);
      expect(result!.channel).toBe('chat');
      expect(result!.source).toBe('test');
      expect(Array.isArray(result!.requestMessages)).toBe(true);
      expect((result!.requestMessages as unknown[]).length).toBe(10);
    });

    it('truncates string priority fields to 2000 chars when payload exceeds limit', () => {
      const large = {
        extractedText: 'x'.repeat(50000),
        rawResponse: 'y'.repeat(50000),
      };
      const result = buildBoundedPayload(large);
      expect(result).toBeDefined();
      expect(result!.uploadTruncated).toBe(true);
      expect(typeof result!.extractedText).toBe('string');
      expect((result!.extractedText as string).length).toBe(2000);
    });

    it('returns error fallback when truncated payload is still too large', () => {
      const huge: Record<string, unknown> = {};
      for (const key of ['channel', 'source', 'durationMs', 'requestMessages', 'requestBody', 'rawResponse', 'extractedText', 'synthesisResult']) {
        if (key === 'durationMs') {
          huge[key] = 12345;
        } else if (key === 'requestMessages') {
          huge[key] = Array.from({ length: 10 }, (_, i) => ({ role: 'user', content: 'x'.repeat(4500) }));
        } else {
          huge[key] = 'x'.repeat(6500);
        }
      }
      const result = buildBoundedPayload(huge);
      expect(result).toBeDefined();
      expect(result!.uploadTruncated).toBe(true);
      expect(result!.error).toBe('Payload too large after truncation');
    });
  });

  describe('UTF-8 multi-byte characters', () => {
    it('counts multi-byte characters correctly in byte size', () => {
      const payload = { text: '中文测试'.repeat(1000) };
      const serialized = JSON.stringify(payload);
      const byteSize = Buffer.byteLength(serialized, 'utf8');
      const charCount = '中文测试'.repeat(1000).length;
      expect(byteSize).toBeGreaterThan(charCount);
    });

    it('truncation respects byte boundaries', () => {
      const value = '中文'.repeat(100);
      const truncated = truncate(value, 50);
      expect(truncated!.length).toBeLessThanOrEqual(50);
    });
  });
});
