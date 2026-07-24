import { describe, expect, it } from 'vitest';
import { detectSensitiveDescriptors, redactSensitiveText } from './sensitive-descriptors';

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

  it.each([
    '12 Jalan Bukit, Petaling Jaya',
    'No. 12, Jalan Ampang, Kuala Lumpur',
    '8 Lorong 3, Taman Example',
    'alamat saya 12 Jalan Example',
  ])('detects bounded Malaysian address corpus: %s', (text) => {
    expect(detectSensitiveDescriptors(text).some((descriptor) => descriptor.kind === 'address')).toBe(true);
  });

  it.each(['2026-08-31', '22.15.32', 'There are 42 items.', 'Version 3.12.10'])('does not misclassify a date/version fixture: %s', (text) => {
    expect(detectSensitiveDescriptors(text)).toEqual([]);
  });

  it('redacts classified values with stable placeholders', () => {
    const value = 'Call +60 12-345 6789 or email user@example.com.';
    const result = redactSensitiveText(value);
    expect(result.text).not.toContain('+60 12-345 6789');
    expect(result.text).not.toContain('user@example.com');
    expect(result.redactions).toEqual(expect.arrayContaining(['phone', 'email']));
  });
});
