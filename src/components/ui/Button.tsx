import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { Colors, Fonts, Spacing } from '@/constants/theme';

type ButtonVariant = 'primary' | 'secondary';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ label, onPress, variant = 'primary', loading, disabled }: ButtonProps) {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={isPrimary ? Colors.text : Colors.text} />
      ) : (
        <Text style={[styles.label, isPrimary ? styles.labelPrimary : styles.labelSecondary]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 60,
    // Rectángulo bien redondeado, no una "píldora" — así se ve en el
    // mockup, no un óvalo completo como daba Radius.button (28 = mitad de
    // los 56 de alto).
    borderRadius: 16,
    // El botón siempre ocupa el ancho de su contenedor. Sin esto, dentro de
    // una tarjeta con `alignItems: 'center'` (los avisos de "todavía no
    // tienes cuenta" de Perfil y Publicar) se encogía al ancho del texto y
    // quedaba como una cajita apretada, con las letras pegadas al borde.
    alignSelf: 'stretch',
    // Respaldo para cualquier caso donde el ancho igual quede al contenido.
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.three,
  },
  primary: {
    backgroundColor: Colors.accent,
    // El botón del mockup no es rojo plano: tiene un degradado vertical que
    // arranca más anaranjado arriba y se hunde al rojo de marca abajo.
    // `experimental_backgroundImage` viene en el core de React Native 0.86,
    // así que no hace falta expo-linear-gradient (que obligaría a recompilar
    // el APK). El `backgroundColor` de arriba queda como respaldo por si la
    // propiedad no está disponible en alguna plataforma.
    experimental_backgroundImage: 'linear-gradient(180deg, #F23A06 0%, #D90804 55%, #BC0603 100%)',
  },
  secondary: {
    backgroundColor: '#000000',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontFamily: Fonts.bold,
    fontSize: 18,
  },
  labelPrimary: {
    color: '#FFFFFF',
  },
  labelSecondary: {
    color: '#FFFFFF',
  },
});
