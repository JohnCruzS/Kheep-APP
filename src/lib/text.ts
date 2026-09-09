const DIACRITICOS = new RegExp('[̀-ͯ]', 'g');

/**
 * Normaliza texto para comparar/buscar sin que importen mayúsculas ni
 * tildes ("Ñuñoa" y "ñuñoa" quedan iguales; "Nuñoa" sin tilde en la u
 * también calza con "Nuñoa"). La ñ no se descompone con NFD, así que sigue
 * siendo una letra distinta de la n — "Ñuñoa" nunca calza con "Nunoa".
 */
export function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(DIACRITICOS, '').toLowerCase().trim();
}
