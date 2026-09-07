/**
 * Extrae un mensaje legible de cualquier error atrapado en un catch.
 *
 * `err instanceof Error` no alcanza: los errores que devuelve
 * supabase-js (de Postgres/PostgREST, ej. violaciones de RLS o de
 * constraints) son objetos planos con `.message`, no instancias de
 * `Error` — con solo `instanceof Error` esos mensajes se perdían y el
 * usuario veía siempre el texto genérico de repuesto, incluso cuando el
 * error real explicaba exactamente qué pasó.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return fallback;
}
