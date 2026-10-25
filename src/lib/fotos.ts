import { PixelRatio } from 'react-native';

/**
 * Fotos del tamaño justo.
 *
 * Las fotos se suben bastante grandes (hasta 900 px un producto y 400 px la
 * foto del comercio) porque se pueden abrir a pantalla completa. Pero en una
 * tarjeta se ven mucho más chicas: la foto del comercio es un círculo de 58
 * puntos y bajarla completa eran ~700 KB por tarjeta.
 *
 * Supabase puede entregar cualquier foto ya achicada (transformación de
 * imágenes, plan Pro): en vez de `/object/public/` se pide a
 * `/render/image/public/` con el ancho que hace falta. Medido en el proyecto:
 * la foto de un comercio pasó de 712 KB a 15 KB, y la de un producto al
 * tamaño de la tarjeta, de 126 KB a 55 KB.
 *
 * El ancho se redondea hacia arriba de 100 en 100: así todas las pantallas
 * parecidas piden la misma versión y se aprovecha mejor el caché.
 *
 * Siempre con `resize=contain`: pidiendo solo el ancho, Supabase deja el
 * alto original y RECORTA los costados (una foto de 356×356 pedida a 200
 * volvía de 200×356, solo la franja del centro). Por eso la foto de perfil
 * no mostraba lo que se había elegido en el recorte. Con `contain` se
 * achica entera, sin perder nada.
 */
const TRAMO = 100;
const ANCHO_MAX = 1600;
const CALIDAD = 75;

const MARCA_ORIGINAL = '/storage/v1/object/public/';
const MARCA_TRANSFORMADA = '/storage/v1/render/image/public/';

/** Si la URL es una foto pública de nuestro almacenamiento (y no un archivo local o de otro sitio). */
function esDeSupabase(url: string): boolean {
  return url.includes(MARCA_ORIGINAL);
}

/**
 * La URL de la foto achicada para mostrarse a `anchoPuntos` de ancho en
 * pantalla. Si no es una foto de Supabase (una recién elegida de la galería,
 * por ejemplo), devuelve la misma URL.
 */
export function urlAjustada(url: string, anchoPuntos: number): string {
  if (!esDeSupabase(url) || anchoPuntos <= 0) return url;
  const pixeles = Math.min(ANCHO_MAX, Math.ceil((anchoPuntos * PixelRatio.get()) / TRAMO) * TRAMO);
  return `${url.replace(MARCA_ORIGINAL, MARCA_TRANSFORMADA)}?width=${pixeles}&quality=${CALIDAD}&resize=contain`;
}

/**
 * Una versión diminuta (32 px) de la foto: pesa ~1 KB, llega casi al
 * instante y, estirada al tamaño de la foto, se ve como un difuminado
 * mientras carga la de verdad. null si la foto no es de Supabase.
 */
export function urlDifuminada(url: string): string | null {
  if (!esDeSupabase(url)) return null;
  return `${url.replace(MARCA_ORIGINAL, MARCA_TRANSFORMADA)}?width=32&quality=20&resize=contain`;
}
