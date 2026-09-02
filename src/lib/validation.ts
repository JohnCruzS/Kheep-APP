const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

/**
 * Normaliza un teléfono chileno ingresado como "9 1234 5678" o "+56912345678"
 * al formato E.164 completo (+56912345678) para guardarlo consistente.
 */
export function normalizeChileanPhone(value: string): string {
  const digitsOnly = value.replace(/\D/g, '');
  const withoutCountryCode = digitsOnly.startsWith('56')
    ? digitsOnly.slice(2)
    : digitsOnly;
  return `+56${withoutCountryCode}`;
}

export function isValidChileanPhone(value: string): boolean {
  return /^\+569\d{8}$/.test(normalizeChileanPhone(value));
}
