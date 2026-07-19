import type { TranslationKey } from '../../i18n';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RegistrationCredentials {
  email: string;
  username: string;
  password: string;
}

export function validateRegistrationCredentials({
  email,
  username,
  password,
}: RegistrationCredentials): TranslationKey | undefined {
  if (!EMAIL_PATTERN.test(email.trim())) return 'online_auth_email_invalid';

  const trimmedUsername = username.trim();
  if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
    return 'online_auth_username_invalid';
  }

  if (password.length < 8 || password.length > 128) {
    return 'online_auth_password_invalid';
  }

  return undefined;
}

export function validateLoginCredentials(email: string): TranslationKey | undefined {
  return EMAIL_PATTERN.test(email.trim()) ? undefined : 'online_auth_email_invalid';
}
