/**
 * Supabase devuelve los mensajes de error de Auth en inglés y sin control
 * sobre el texto. Los traducimos a algo entendible para el usuario final.
 */
export function translateAuthError(message: string): string {
  const lower = message.toLowerCase();

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
