import { describe, expect, it } from 'vitest';
import { detectSensitiveDescriptors } from './sensitive-descriptors';

describe('detectSensitiveDescriptors', () => {
  it.each([
    ['email', 'email', 'user@example.com'],
    ['Malaysian phone', 'phone', '+60 12-345 6789'],
    ['international phone', 'phone', '+1 212 555 0199'],
    ['account number', 'account', 'bank account number is 123456789012'],
    ['payment card', 'financial', '4111 1111 1111 1111'],
    ['IBAN', 'financial', 'GB82WEST12345698765432'],
    ['medical record', 'medical', 'medical record ID is MR-88291'],
    ['tax identifier', 'financial', 'tax id is TX-1234567'],
    ['postal address', 'address', '123 Example Road'],
    ['API key', 'credential', 'api_key=sk-abcdefghijklmnopqrstuvwxyz'],
    ['bearer token', 'credential', 'Bearer abcdefghijklmnop'],
    ['private canary', 'private_canary', 'MEMORY_CANARY_ABC123'],
  ])('detects %s', (_label, kind, text) => {
    expect(detectSensitiveDescriptors(text).some((descriptor) => descriptor.kind === kind)).toBe(true);
  });

  it('does not classify ordinary numbers or public text', () => {
    expect(detectSensitiveDescriptors('There are 42 apples in the public park.')).toEqual([]);
  });
});
