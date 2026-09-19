/**
 * Supabase devuelve los mensajes de error de Auth en inglés y sin control
 * sobre el texto. Los traducimos a algo entendible para el usuario final.
 */
export function translateAuthError(message: string): string {
  const lower = message.toLowerCase();

  // Va antes que 'is invalid': este mensaje también lo contiene y se
  // confundiría con un correo mal escrito.
  if (lower.includes('token') && (lower.includes('expired') || lower.includes('invalid'))) {
    return 'El código es incorrecto o ya venció. Revisa el último correo o pide uno nuevo.';
  }
  if (lower.includes('different from the old password')) {
    return 'La contraseña nueva tiene que ser distinta de la anterior.';
  }
  if (lower.includes('for security purposes') || lower.includes('only request this after')) {
    return 'Espera un momento antes de pedir otro código.';
  }
  if (lower.includes('rate limit')) {
    return 'Se enviaron demasiados correos en poco tiempo. Espera unos minutos e intenta de nuevo.';
  }
  if (lower.includes('is invalid')) {
    return 'Ese correo electrónico no es válido. Revisa que esté bien escrito.';
  }
  if (lower.includes('already registered') || lower.includes('already exists')) {
    return 'Ya existe una cuenta con ese correo.';
  }
  if (lower.includes('password') && lower.includes('at least')) {
    return 'La contraseña es demasiado corta.';
  }
  if (lower.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.';
  }

  return message;
}
