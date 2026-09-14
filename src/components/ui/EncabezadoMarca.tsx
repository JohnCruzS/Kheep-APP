import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from '@/components/ui/BrandLogo';
import { Colors, Fonts, Spacing } from '@/constants/theme';

/**
 * El encabezado de las pantallas del panel: el título de la app y, debajo,
 * dónde está parado el admin — "Chile" en la lista de regiones, el nombre de
 * la comuna al entrar en una.
 *
 * Es el mismo bloque que ve el usuario en el catálogo (logo + comuna), y por
 * eso se repite acá: al administrar una comuna, la pantalla se parece a lo que
 * esa comuna va a mostrar.
 *
 * `onVolver` dibuja la flecha de regreso superpuesta, sin descolocar el
 * título: si la flecha ocupara sitio en la fila, el logo dejaría de estar
 * centrado en la pantalla.
 */
export function EncabezadoMarca({ subtitulo, onVolver }: { subtitulo: string; onVolver?: () => void }) {
  return (
    <View style={styles.bloque}>
      <BrandLogo height={34} />
      <Text style={styles.subtitulo} numberOfLines={1}>
        {subtitulo}
      </Text>

      {onVolver && (
        <Pressable style={styles.volver} onPress={onVolver} hitSlop={14} accessibilityRole="button" accessibilityLabel="Volver">
          <Text style={styles.flecha}>‹</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bloque: {
    alignItems: 'center',
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
  },
  subtitulo: {
    fontFamily: Fonts.light,
    marginTop: 2,
    fontSize: 17,
    color: Colors.textMuted,
    maxWidth: '70%',
  },
  volver: {
    position: 'absolute',
    left: Spacing.three,
    top: Spacing.three,
    paddingHorizontal: Spacing.two,
  },
  flecha: {
    fontFamily: Fonts.light,
    fontSize: 32,
    lineHeight: 36,
    color: Colors.accent,
  },
});
