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
 * "Baloo 2" — la tipografía redondeada y gruesa del mockup del cliente (el
 * mismo estilo que usan apps de delivery como Swiggy). Cada peso es un
 * archivo de fuente distinto, así que se usa en vez de `fontWeight` — mezclar
 * ambos en Android puede terminar aplicando un negrita sintético feo encima
 * del archivo ya negrita.
 */
export const Fonts = {
  regular: 'Baloo2_400Regular',
  medium: 'Baloo2_500Medium',
  semiBold: 'Baloo2_600SemiBold',
  bold: 'Baloo2_700Bold',
  extraBold: 'Baloo2_800ExtraBold',
} as const;
