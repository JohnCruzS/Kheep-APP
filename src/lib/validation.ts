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

/**
 * El celular se escribe SIEMPRE como 9 y ocho dígitos (pedido del cliente):
 * "912345678". El +56 lo agrega la app al guardar.
 */
export function isValidChileanPhone(value: string): boolean {
  return /^9\d{8}$/.test(value.replace(/\D/g, ''));
}

/** Mientras se escribe: solo dígitos y como máximo los nueve del celular. */
export function soloCelular(value: string): string {
  return value.replace(/\D/g, '').slice(0, 9);
}

/** Un celular guardado (+56912345678) tal como se escribe en el campo: 912345678. */
export function celularLocal(value: string | null | undefined): string {
  const digitos = (value ?? '').replace(/\D/g, '');
  return (digitos.startsWith('56') ? digitos.slice(2) : digitos).slice(0, 9);
}

/** El aviso cuando el celular no tiene el formato. */
export const MENSAJE_CELULAR = 'El celular tiene que ser 9 y ocho dígitos, por ejemplo 912345678.';
