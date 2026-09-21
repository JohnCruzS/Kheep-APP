import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { useTarjetaClara } from '@/components/ui/TarjetaClara';
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
  // En la tarjeta blanca del acceso, el botón secundario es negro macizo; en
  // el resto de la app va sobre negro, así que es un contorno blanco.
  const claro = useTarjetaClara();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : claro ? styles.secondaryClaro : styles.secondary,
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
    height: 62,
    // Rectángulo bien redondeado, no una "píldora" — así se ve en el
    // mockup, no un óvalo completo como daba Radius.button (28 = mitad de
    // los 56 de alto).
    borderRadius: 14,
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
    // Rojo plano, como el documento EDIT APP: el degradado era del mockup
    // anterior.
    backgroundColor: Colors.accent,
    // El botón del mockup no es rojo plano: tiene un degradado vertical que
    // arranca más anaranjado arriba y se hunde al rojo de marca abajo.
    // `experimental_backgroundImage` viene en el core de React Native 0.86,
    // así que no hace falta expo-linear-gradient (que obligaría a recompilar
    // el APK). El `backgroundColor` de arriba queda como respaldo por si la
    // propiedad no está disponible en alguna plataforma.
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  secondaryClaro: {
    backgroundColor: '#000000',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontFamily: Fonts.medium,
    fontSize: 21,
  },
  labelPrimary: {
    fontFamily: Fonts.light,
    color: '#FFFFFF',
  },
  labelSecondary: {
    fontFamily: Fonts.light,
    color: '#FFFFFF',
  },
});
