/**
 * The single authoritative classifier for values that must not become durable
 * Phase 0 Memory or be disclosed to an external Action without a turn-local
 * user authorization. It intentionally returns values only to in-process
 * callers; callers must never log descriptor values.
 */
export type SensitiveDescriptorKind =
  | 'email'
  | 'phone'
  | 'account'
  | 'credential'
  | 'identifier'
  | 'medical'
  | 'financial'
  | 'address'
  | 'private_canary';

export interface SensitiveDescriptor {
  kind: SensitiveDescriptorKind;
  value: string;
  valueHash: string;
}

export type SensitiveDescriptorSource =
  | 'current_message'
  | 'history'
  | 'private_memory'
  | 'memory_candidate'
  | 'action_payload';

export interface DetectSensitiveDescriptorOptions { source?: SensitiveDescriptorSource; }

export const MAX_CANONICAL_MEMORY_CHARACTERS = 1_000;
export const MAX_RENDERED_REPLY_CHARACTERS = 4_000;
export const MAX_REPLY_SEGMENT_CHARACTERS = 1_000;
export const MAX_RENDERED_MEMORY_CHARACTERS = 2_000;

type DescriptorPattern = readonly [SensitiveDescriptorKind, RegExp];

const DESCRIPTOR_PATTERNS: readonly DescriptorPattern[] = [
  ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ['credential', /\b(?:sk-[A-Za-z0-9_-]{10,}|Bearer\s+[A-Za-z0-9._-]{8,}|(?:api[_ -]?key|access[_ -]?token|password|passwd|pwd|credentials?)\s*[:=]\s*\S+)\b/gi],
  ['account', /\b(?:bank\s+)?account\s*(?:number|no\.?|#)?\s*(?:(?:is)|[:=])?\s*\d{8,}\b/gi],
  ['financial', /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g],
  ['financial', /\b(?:\d[ -]*?){13,19}\b/g],
  ['financial', /\b(?:tax|transaction|financial)\s*(?:id|number|no\.?|#)?\s*(?:(?:is)|[:=])?\s*[A-Z0-9-]{6,}\b/gi],
  ['medical', /\b(?:medical\s+record|patient|MR)\s*(?:number|id|no\.?|#)?\s*[:=\-]?\s*[A-Z0-9-]{4,}\b/gi],
  ['identifier', /\b(?:national\s+id|government\s+id|passport|ssn|social\s+security)\s*(?:number|id|no\.?|#)?\s*[:=]?\s*[A-Z0-9-]{4,}\b/gi],
  ['identifier', /\b[a-f0-9]{24,}\b/gi],
  ['phone', /(?<![\p{L}\p{N}])(?:\+\d{1,3}[ .-]?)?(?:\(?\d{2,4}\)?[ .-]?){2,4}\d{2,4}(?![\p{L}\p{N}])/gu],
  ['address', /\b\d{1,5}\s+[A-Za-z][A-Za-z .'-]{2,}\s(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd)\b/gi],
  ['private_canary', /\b(?:PRIVATE_|SECRET_|INTERNAL_ONLY_|CONFIDENTIAL_|USER_PRIVATE_|MEMORY_CANARY_)[A-Z0-9_]{3,}\b/g],
];

/** A deterministic non-secret correlation token; never use this as cryptography. */
function stableValueHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const char of value.toLowerCase()) {
    const code = char.codePointAt(0) ?? 0;
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ (code + 0x9e37), 0x85ebca6b) >>> 0;
  }
  return `sd1-${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`;
}

/** Bounded, deterministic descriptor detection. Generic uppercase words are not canaries. */
export function detectSensitiveDescriptors(text: string, _options: DetectSensitiveDescriptorOptions = {}): SensitiveDescriptor[] {
  const source = text.slice(0, 16_000);
  const found = new Map<string, SensitiveDescriptor>();
  for (const [kind, pattern] of DESCRIPTOR_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const value = match[0]?.trim();
      if (!value) continue;
      found.set(`${kind}:${value.toLowerCase()}`, { kind, value, valueHash: stableValueHash(value) });
    }
  }
  return [...found.values()];
}

export function hasSensitiveDescriptor(text: string, options?: DetectSensitiveDescriptorOptions): boolean {
  return detectSensitiveDescriptors(text, options).length > 0;
}

export function isCredentialDescriptor(kind: SensitiveDescriptorKind): boolean {
  return kind === 'credential' || kind === 'private_canary';
}
