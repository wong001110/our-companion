import type { DeveloperDebugEvent, DeveloperDebugUploadEvent } from '@our-companion/shared';
import { redactSecrets } from '@our-companion/shared';

export const FIELD_LIMITS = {
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

export const MAX_EVENT_PAYLOAD_BYTES = 48 * 1024;
export const MAX_BATCH_TARGET_BYTES = 60 * 1024;
export const ABSOLUTE_BATCH_LIMIT = 64 * 1024;

const REDACT_TEXT_PATTERNS: Array<[RegExp, string]> = [
  [/Cookie:\s*[^\r\n]*/gi, 'Cookie: [REDACTED]'],
  [/Set-Cookie:\s*[^\r\n]*/gi, 'Set-Cookie: [REDACTED]'],
  [/Authorization:\s*Bearer\s+\S+/gi, 'Authorization: Bearer [REDACTED]'],
  [/Authorization:\s*Basic\s+\S+/gi, 'Authorization: Basic [REDACTED]'],
  [/Authorization:\s*(?!Bearer\s|Basic\s)\S+/gi, 'Authorization: [REDACTED]'],
  [/Bearer\s+\S+/gi, 'Bearer [REDACTED]'],
  [/\brefreshToken\s*[=:]\s*\S+/gi, 'refreshToken=[REDACTED]'],
  [/\brefresh_token\s*[=:]\s*\S+/gi, 'refresh_token=[REDACTED]'],
  [/\baccessToken\s*[=:]\s*\S+/gi, 'accessToken=[REDACTED]'],
  [/\baccess_token\s*[=:]\s*\S+/gi, 'access_token=[REDACTED]'],
  [/\bapiKey\s*[=:]\s*\S+/gi, 'apiKey=[REDACTED]'],
  [/\bapi_key\s*[=:]\s*\S+/gi, 'api_key=[REDACTED]'],
  [/\bclientSecret\s*[=:]\s*\S+/gi, 'clientSecret=[REDACTED]'],
  [/\bclient_secret\s*[=:]\s*\S+/gi, 'client_secret=[REDACTED]'],
  [/\bpassword\s*[=:]\s*\S+/gi, 'password=[REDACTED]'],
  [/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED_JWT]'],
];

export function sanitizeDeveloperDebugText(value: string): string {
  let result = value;
  for (const [pattern, replacement] of REDACT_TEXT_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function sanitizeDeveloperDebugValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeDeveloperDebugText(value);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitizeDeveloperDebugValue);
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = sanitizeDeveloperDebugValue(val);
  }
  return result;
}

export function truncate(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

export function sanitizeErrorMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;
  return truncate(sanitizeDeveloperDebugText(message), FIELD_LIMITS.errorMessage);
}

export function buildBoundedPayload(payload: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!payload) return {};
  const redacted = sanitizeDeveloperDebugValue(payload) as Record<string, unknown>;
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

export function buildDeveloperDebugUploadEvent(event: DeveloperDebugEvent): DeveloperDebugUploadEvent {
  return {
    clientEventId: truncate(event.id, FIELD_LIMITS.clientEventId) ?? event.id,
    kind: truncate(event.kind, FIELD_LIMITS.kind) ?? event.kind,
    operation: truncate(event.operation, FIELD_LIMITS.operation),
    status: truncate(event.status, FIELD_LIMITS.status),
    provider: truncate(event.provider, FIELD_LIMITS.provider),
    model: truncate(event.model, FIELD_LIMITS.model),
    companionId: truncate(event.companionId, FIELD_LIMITS.companionId),
    correlationId: truncate(event.correlationId, FIELD_LIMITS.correlationId),
    cycleId: truncate(event.cycleId, FIELD_LIMITS.cycleId),
    turnId: truncate(event.turnId, FIELD_LIMITS.turnId),
    summary: truncate(sanitizeDeveloperDebugText(event.summary ?? ''), FIELD_LIMITS.summary),
    payload: buildBoundedPayload(event.payload),
    errorCode: truncate(event.errorCode, FIELD_LIMITS.errorCode),
    errorMessage: sanitizeErrorMessage(event.errorMessage),
    clientCreatedAt: event.createdAt,
  };
}

export function buildDeveloperDebugUploadBatch(pending: DeveloperDebugEvent[]): DeveloperDebugUploadEvent[][] {
  const batches: DeveloperDebugUploadEvent[][] = [];
  let currentBatch: DeveloperDebugUploadEvent[] = [];
  let currentBatchBytes = 0;

  for (const event of pending) {
    const uploadEvent = buildDeveloperDebugUploadEvent(event);
    const serialized = JSON.stringify(uploadEvent);
    const eventBytes = Buffer.byteLength(serialized, 'utf8');

    if (currentBatch.length > 0 && (
      currentBatch.length >= 50 ||
      currentBatchBytes + eventBytes > MAX_BATCH_TARGET_BYTES
    )) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchBytes = 0;
    }

    if (eventBytes > ABSOLUTE_BATCH_LIMIT) {
      const fallback: DeveloperDebugUploadEvent = {
        clientEventId: uploadEvent.clientEventId,
        kind: uploadEvent.kind,
        operation: uploadEvent.operation,
        status: uploadEvent.status,
        errorMessage: uploadEvent.errorMessage,
        clientCreatedAt: uploadEvent.clientCreatedAt,
        payload: { uploadTruncated: true, originalPayloadBytes: eventBytes },
      };
      currentBatch.push(fallback);
      currentBatchBytes += Buffer.byteLength(JSON.stringify(fallback), 'utf8');
      continue;
    }

    currentBatch.push(uploadEvent);
    currentBatchBytes += eventBytes;
  }

  if (currentBatch.length > 0) batches.push(currentBatch);
  return batches;
}

export function batchBodyByteSize(batch: DeveloperDebugUploadEvent[]): number {
  return Buffer.byteLength(JSON.stringify({ events: batch }), 'utf8');
}
