import { describe, expect, it } from 'vitest';
import {
  FIELD_LIMITS,
  MAX_EVENT_PAYLOAD_BYTES,
  truncate,
  sanitizeDeveloperDebugText,
  sanitizeErrorMessage,
  buildBoundedPayload,
  buildDeveloperDebugUploadEvent,
  buildDeveloperDebugUploadBatch,
  batchBodyByteSize,
} from './developerDebugUpload';
import type { DeveloperDebugEvent, DeveloperDebugUploadEvent } from '@our-companion/shared';

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

  describe('sanitizeDeveloperDebugText', () => {
    it('redacts Bearer tokens', () => {
      expect(sanitizeDeveloperDebugText('Error with Bearer abc123secret')).toBe('Error with Bearer [REDACTED]');
    });

    it('redacts Authorization: Bearer headers', () => {
      expect(sanitizeDeveloperDebugText('Authorization: Bearer token123')).toBe('Authorization: Bearer [REDACTED]');
    });

    it('redacts Authorization: Basic headers', () => {
      expect(sanitizeDeveloperDebugText('Authorization: Basic dXNlcjpwYXNz')).toBe('Authorization: Basic [REDACTED]');
    });

    it('redacts Cookie values including multiple cookies', () => {
      expect(sanitizeDeveloperDebugText('Cookie: session=abc123; other=xyz')).toBe('Cookie: [REDACTED]');
    });

    it('redacts Set-Cookie headers', () => {
      expect(sanitizeDeveloperDebugText('Set-Cookie: session=abc123; path=/')).toBe('Set-Cookie: [REDACTED]');
    });

    it('redacts refreshToken assignments', () => {
      expect(sanitizeDeveloperDebugText('refreshToken=secret123 failed')).toBe('refreshToken=[REDACTED] failed');
      expect(sanitizeDeveloperDebugText('refreshToken: secret123 failed')).toBe('refreshToken=[REDACTED] failed');
      expect(sanitizeDeveloperDebugText('refreshToken = secret123 failed')).toBe('refreshToken=[REDACTED] failed');
    });

    it('redacts refresh_token assignments', () => {
      expect(sanitizeDeveloperDebugText('refresh_token=secret123')).toBe('refresh_token=[REDACTED]');
    });

    it('redacts accessToken assignments', () => {
      expect(sanitizeDeveloperDebugText('accessToken=secret123')).toBe('accessToken=[REDACTED]');
    });

    it('redacts access_token assignments', () => {
      expect(sanitizeDeveloperDebugText('access_token=secret123')).toBe('access_token=[REDACTED]');
    });

    it('redacts apiKey assignments', () => {
      expect(sanitizeDeveloperDebugText('apiKey=secret123 invalid')).toBe('apiKey=[REDACTED] invalid');
      expect(sanitizeDeveloperDebugText('apiKey: secret123 invalid')).toBe('apiKey=[REDACTED] invalid');
    });

    it('redacts api_key assignments', () => {
      expect(sanitizeDeveloperDebugText('api_key=secret123')).toBe('api_key=[REDACTED]');
    });

    it('redacts clientSecret assignments', () => {
      expect(sanitizeDeveloperDebugText('clientSecret=secret123')).toBe('clientSecret=[REDACTED]');
    });

    it('redacts client_secret assignments', () => {
      expect(sanitizeDeveloperDebugText('client_secret=secret123')).toBe('client_secret=[REDACTED]');
    });

    it('redacts password assignments', () => {
      expect(sanitizeDeveloperDebugText('password=secret123')).toBe('password=[REDACTED]');
    });

    it('redacts bare JWT tokens', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      expect(sanitizeDeveloperDebugText(`Token: ${jwt}`)).toBe('Token: [REDACTED_JWT]');
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('returns undefined for undefined input', () => {
      expect(sanitizeErrorMessage(undefined)).toBeUndefined();
    });

    it('truncates to FIELD_LIMITS.errorMessage', () => {
      const longMessage = 'x'.repeat(2000);
      const result = sanitizeErrorMessage(longMessage);
      expect(result!.length).toBe(FIELD_LIMITS.errorMessage);
    });
  });

  describe('buildBoundedPayload', () => {
    it('returns empty object for undefined input', () => {
      expect(buildBoundedPayload(undefined)).toEqual({});
    });

    it('returns empty object for null input', () => {
      expect(buildBoundedPayload(null as unknown as undefined)).toEqual({});
    });

    it('returns payload unchanged when under byte limit', () => {
      const small = { channel: 'chat', source: 'test' };
      expect(buildBoundedPayload(small)).toEqual(small);
    });

    it('redacts secrets in payload', () => {
      const payload = { authorization: 'Bearer secret-token', safe: 'ok' };
      const result = buildBoundedPayload(payload);
      expect(result.authorization).toBe('[REDACTED]');
      expect(result.safe).toBe('ok');
    });

    it('redacts sensitive keys by key name', () => {
      const payload = {
        apiKey: 'secret123',
        api_key: 'secret123',
        accessToken: 'secret123',
        refreshToken: 'secret123',
        clientSecret: 'secret123',
        password: 'secret123',
        authorization: 'arbitrary-secret',
        cookie: 'session=secret',
        safe: 'visible',
      };
      const result = buildBoundedPayload(payload);
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.api_key).toBe('[REDACTED]');
      expect(result.accessToken).toBe('[REDACTED]');
      expect(result.refreshToken).toBe('[REDACTED]');
      expect(result.clientSecret).toBe('[REDACTED]');
      expect(result.password).toBe('[REDACTED]');
      expect(result.authorization).toBe('[REDACTED]');
      expect(result.cookie).toBe('[REDACTED]');
      expect(result.safe).toBe('visible');
    });

    it('redacts sensitive keys in nested objects', () => {
      const payload = {
        headers: { authorization: 'Bearer x', cookie: 'session=abc' },
        safe: 'ok',
      };
      const result = buildBoundedPayload(payload);
      expect(result.headers).toEqual({ authorization: '[REDACTED]', cookie: '[REDACTED]' });
      expect(result.safe).toBe('ok');
    });

    it('redacts sensitive keys in arrays of objects', () => {
      const payload = {
        items: [{ apiKey: 'secret', normal: 'keep' }],
      };
      const result = buildBoundedPayload(payload);
      expect(result.items).toEqual([{ apiKey: '[REDACTED]', normal: 'keep' }]);
    });

    it('redacts Bearer/JWT in requestMessages content', () => {
      const payload = {
        requestMessages: [
          { role: 'user', content: 'Bearer sk-abc123secret' },
          { role: 'assistant', content: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U' },
        ],
      };
      const result = buildBoundedPayload(payload);
      expect((result.requestMessages as Array<{ role: string; content: string }>)[0].content).toBe('Bearer [REDACTED]');
      expect((result.requestMessages as Array<{ role: string; content: string }>)[1].content).toBe('[REDACTED_JWT]');
    });

    it('redacts secrets in summary field via buildDeveloperDebugUploadEvent', () => {
      const event: DeveloperDebugEvent = {
        id: 'evt-1',
        kind: 'ai_call',
        summary: 'apiKey=secret123 and Bearer token',
        createdAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'pending',
        syncAttemptCount: 0,
      };
      const uploadEvent = buildDeveloperDebugUploadEvent(event);
      expect(uploadEvent.summary).toBe('apiKey=[REDACTED] and Bearer [REDACTED]');
    });

    it('redacts secrets in errorMessage field', () => {
      const event: DeveloperDebugEvent = {
        id: 'evt-1',
        kind: 'ai_call',
        errorMessage: 'password=secret123 failed',
        createdAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'pending',
        syncAttemptCount: 0,
      };
      const uploadEvent = buildDeveloperDebugUploadEvent(event);
      expect(uploadEvent.errorMessage).toBe('password=[REDACTED] failed');
    });

    it('preserves priority fields when payload exceeds limit', () => {
      const large = {
        channel: 'chat',
        source: 'test',
        requestMessages: Array.from({ length: 20 }, (_, i) => ({ role: 'user', content: `msg${i}: ${'x'.repeat(3000)}` })),
      };
      const result = buildBoundedPayload(large);
      expect(result).toBeDefined();
      expect(result.uploadTruncated).toBe(true);
      expect(result.channel).toBe('chat');
      expect(result.source).toBe('test');
      expect(Array.isArray(result.requestMessages)).toBe(true);
      expect((result.requestMessages as unknown[]).length).toBe(10);
    });

    it('truncates string priority fields to 2000 chars when payload exceeds limit', () => {
      const large = {
        extractedText: 'x'.repeat(50000),
        rawResponse: 'y'.repeat(50000),
      };
      const result = buildBoundedPayload(large);
      expect(result).toBeDefined();
      expect(result.uploadTruncated).toBe(true);
      expect(typeof result.extractedText).toBe('string');
      expect((result.extractedText as string).length).toBe(2000);
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
      expect(result.uploadTruncated).toBe(true);
      expect(result.error).toBe('Payload too large after truncation');
    });
  });

  describe('buildDeveloperDebugUploadEvent', () => {
    it('always includes payload object', () => {
      const event: DeveloperDebugEvent = {
        id: 'evt-1',
        kind: 'ai_call',
        createdAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'pending',
        syncAttemptCount: 0,
      };
      const uploadEvent = buildDeveloperDebugUploadEvent(event);
      expect(uploadEvent.payload).toBeDefined();
      expect(typeof uploadEvent.payload).toBe('object');
    });

    it('returns empty payload when event has no payload', () => {
      const event: DeveloperDebugEvent = {
        id: 'evt-1',
        kind: 'ai_call',
        createdAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'pending',
        syncAttemptCount: 0,
      };
      const uploadEvent = buildDeveloperDebugUploadEvent(event);
      expect(uploadEvent.payload).toEqual({});
    });

    it('redacts secrets in summary', () => {
      const event: DeveloperDebugEvent = {
        id: 'evt-1',
        kind: 'ai_call',
        summary: 'Bearer secret-token',
        createdAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'pending',
        syncAttemptCount: 0,
      };
      const uploadEvent = buildDeveloperDebugUploadEvent(event);
      expect(uploadEvent.summary).toBe('Bearer [REDACTED]');
    });

    it('redacts secrets in errorMessage', () => {
      const event: DeveloperDebugEvent = {
        id: 'evt-1',
        kind: 'ai_call',
        errorMessage: 'Bearer secret-token',
        createdAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'pending',
        syncAttemptCount: 0,
      };
      const uploadEvent = buildDeveloperDebugUploadEvent(event);
      expect(uploadEvent.errorMessage).toBe('Bearer [REDACTED]');
    });

    it('redacts secrets in payload', () => {
      const event: DeveloperDebugEvent = {
        id: 'evt-1',
        kind: 'ai_call',
        payload: { authorization: 'Bearer secret-token', safe: 'ok' },
        createdAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'pending',
        syncAttemptCount: 0,
      };
      const uploadEvent = buildDeveloperDebugUploadEvent(event);
      expect(uploadEvent.payload.authorization).toBe('[REDACTED]');
      expect(uploadEvent.payload.safe).toBe('ok');
    });
  });

  describe('buildDeveloperDebugUploadBatch', () => {
    it('splits events into batches of max 50', () => {
      const events: DeveloperDebugEvent[] = Array.from({ length: 120 }, (_, i) => ({
        id: `evt-${i}`,
        kind: 'ai_call',
        payload: { data: `test-${i}` },
        createdAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'pending' as const,
        syncAttemptCount: 0,
      }));
      const batches = buildDeveloperDebugUploadBatch(events);
      expect(batches.length).toBeGreaterThanOrEqual(3);
      expect(batches[0].length).toBeLessThanOrEqual(50);
    });

    it('all batches contain events with payload', () => {
      const events: DeveloperDebugEvent[] = Array.from({ length: 10 }, (_, i) => ({
        id: `evt-${i}`,
        kind: 'ai_call',
        createdAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'pending' as const,
        syncAttemptCount: 0,
      }));
      const batches = buildDeveloperDebugUploadBatch(events);
      for (const batch of batches) {
        for (const event of batch) {
          expect(event.payload).toBeDefined();
          expect(typeof event.payload).toBe('object');
        }
      }
    });

    it('each batch body is under 64 KiB', () => {
      const events: DeveloperDebugEvent[] = Array.from({ length: 50 }, (_, i) => ({
        id: `evt-${i}`,
        kind: 'ai_call',
        payload: { data: 'x'.repeat(500) },
        createdAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'pending' as const,
        syncAttemptCount: 0,
      }));
      const batches = buildDeveloperDebugUploadBatch(events);
      for (const batch of batches) {
        const size = batchBodyByteSize(batch);
        expect(size).toBeLessThanOrEqual(64 * 1024);
      }
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
