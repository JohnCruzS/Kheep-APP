/**
 * Paleta de marca de Kheep — fondo oscuro fijo (no adaptativo por sistema),
 * según la especificación visual: negro dominante, rojo de acento, tarjetas
 * blancas flotantes para formularios.
 */

export const Colors = {
  background: '#000000',
  backgroundAlt: '#111111',
  card: '#FFFFFF',
  cardText: '#1A1A1A',
  accent: '#FF3B00',
  accentPressed: '#D80000',
  text: '#FFFFFF',
  textMuted: '#9A9A9A',
  inputBorder: '#E0E0E0',
  placeholder: '#9A9A9A',
  danger: '#D80000',
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
