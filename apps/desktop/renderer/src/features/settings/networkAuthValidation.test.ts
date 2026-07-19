import { describe, expect, it } from 'vitest';
import { validateLoginCredentials, validateRegistrationCredentials } from './networkAuthValidation';

describe('network authentication validation', () => {
  it('accepts credentials that satisfy the server DTO constraints', () => {
    expect(validateRegistrationCredentials({
      email: 'person@example.com',
      username: 'Person',
      password: 'password123',
    })).toBeUndefined();
    expect(validateLoginCredentials('person@example.com')).toBeUndefined();
  });

  it.each([
    [{ email: 'invalid', username: 'Person', password: 'password123' }, 'online_auth_email_invalid'],
    [{ email: 'person@example.com', username: 'ab', password: 'password123' }, 'online_auth_username_invalid'],
    [{ email: 'person@example.com', username: 'Person', password: 'short' }, 'online_auth_password_invalid'],
  ] as const)('rejects invalid registration credentials', (credentials, expected) => {
    expect(validateRegistrationCredentials(credentials)).toBe(expected);
  });

  it('rejects an invalid login email before making a request', () => {
    expect(validateLoginCredentials('not-an-email')).toBe('online_auth_email_invalid');
  });
});
