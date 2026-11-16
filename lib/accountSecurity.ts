export const MIN_PASSWORD_LENGTH = 12;

export function passwordError(password: string): string {
  return password.length < MIN_PASSWORD_LENGTH ? 'Use at least 12 characters. A long, unique passphrase works well.' : '';
}

export function validUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,24}$/.test(username);
}

export function safeAuthDestination(value: string | null): string {
  return value && ['/', '/auth/security', '/auth/reset-password'].includes(value) ? value : '/';
}
