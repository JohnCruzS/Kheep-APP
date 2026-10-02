import { Dimensions } from 'react-native';

/**
 * La rejilla del cliente: el ancho de la pantalla vale 1000, y TODAS las
 * medidas —también las verticales— se cuentan en esas unidades.
 *
 * Es lo que hace que la app se vea igual en un teléfono chico y en uno
 * grande: nada está en píxeles fijos. Las medidas vienen del documento
 * "EDIT APP" y no se inventan acá; si el cliente cambia una, se cambia en
 * esta tabla y se mueve toda la app con ella.
 */
export const MEDIDA_MAX = 1000;

export const REJILLA = {
  /** Del borde de la pantalla al contenido, a cada lado. */
  margenLateral: 25,
  /** Curvatura de las esquinas del banner y de las tarjetas. */
  curvatura: 25,
  /** Del borde superior de la pantalla al borde superior del banner. */
  bannerSuperior: 340,
  /** Alto del banner. */
  bannerAlto: 450,
  /** Alto de la fila de categorías, incluido su espacio. */
  categoriasAlto: 185,
  /** Alto de la tarjeta de un comercio en el inicio. */
  galeriaAlto: 577,
} as const;

/**
 * La forma en que se recorta cada foto al subirla: la misma del lugar donde
 * se va a mostrar, así lo que la persona elige en el recorte es exactamente
 * lo que se ve, sin que la tarjeta o el banner le corten los bordes.
 *
 *  - Producto: el panel de la foto en la tarjeta del inicio (el 77 % de los
 *    950 de ancho de la tarjeta, por 577 de alto): 731 × 577 ≈ 19 : 15.
 *  - Banner: 950 × 450 = 19 : 9.
 *  - Foto de perfil del comercio: cuadrada.
 */
export const FORMATO_RECORTE = {
  producto: [19, 15],
  banner: [19, 9],
  perfil: [1, 1],
} as const satisfies Record<string, [number, number]>;

/** Cuánto mide hoy una unidad de la rejilla, en píxeles. */
export function unidad(): number {
  return Dimensions.get('window').width / MEDIDA_MAX;
}

/** Convierte una medida de la rejilla a píxeles de esta pantalla. */
export function u(medida: number): number {
  return Math.round(medida * unidad());
}
