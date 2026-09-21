import { Dimensions } from 'react-native';

/**
 * Paleta de marca de Kheep — fondo oscuro fijo (no adaptativo por sistema),
 * según la especificación visual: negro dominante, rojo de acento, tarjetas
 * blancas flotantes para formularios.
 */

export const Colors = {
  background: '#000000',
  backgroundAlt: '#111111',
  /** Gris muy claro sobre el que "flotan" las tarjetas blancas (login, catálogo). */
  backgroundSoft: '#F2F2F2',
  surface: '#17171A',
  surfaceBorder: 'rgba(255,255,255,0.09)',
  card: '#FFFFFF',
  cardText: '#1A1A1A',
  cardTextMuted: '#8A8A90',
  accent: '#D90804',
  accentPressed: '#A80603',
  text: '#FFFFFF',
  textMuted: '#9A9A9A',
  inputBorder: '#E0E0E0',
  placeholder: '#9A9A9A',
  danger: '#D90804',
  success: '#1FAA59',
  successBg: 'rgba(31,170,89,0.14)',
  warning: '#E8A93B',
  warningBg: 'rgba(232,169,59,0.16)',
  whatsapp: '#1FAA59',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  input: 0,
  button: 28,
  card: 24,
  avatar: 999,
} as const;

/**
 * "Poppins" — la tipografía de la plantilla del cliente. Light es la base de
 * toda la app; los pesos más gruesos quedan solo para jerarquía (logo,
 * títulos). Cada peso es un archivo de fuente distinto, así que se usa en vez
 * de `fontWeight` — mezclar ambos en Android puede hacer que caiga a la
 * fuente del sistema.
 */
export const Fonts = {
  light: 'Poppins_300Light',
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semiBold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
  extraBold: 'Poppins_800ExtraBold',
} as const;

/**
 * Distribución en la rejilla base 1000 del cliente: el ancho total de
 * pantalla es 1000, el margen del catálogo (banner y tarjetas) deja 75 a
 * cada lado (7,5%), y el título mide 400 de ancho (40%), centrado. El alto
 * del título y su posición desde arriba son medidas verticales aparte —
 * % del ALTO de la pantalla, no de este ancho — y viven en `src/lib/marca.ts`
 * (`ANCHO_LOGO_DEFECTO` y `MARGEN_LOGO_DEFECTO`) porque además son
 * administrables desde el panel admin, no fijas como estas.
 *
 * Se guardan como proporción del ancho real del teléfono, no como píxeles
 * fijos: así el reparto se mantiene igual en una pantalla chica y en una
 * grande, que es el sentido de trabajar con esas medidas.
 */
const ANCHO_PANTALLA = Dimensions.get('window').width;

export const Layout = {
  /** 25 de 1000, según el documento EDIT APP (antes 75). */
  catalogMargin: Math.round(ANCHO_PANTALLA * 0.025),
} as const;
