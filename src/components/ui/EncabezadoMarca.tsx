import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TituloPosicionado } from '@/components/ui/BrandLogo';
import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { PERIMETRO_ALTO, useMarca } from '@/lib/marca';

/** Separación entre el logo y el texto de abajo, en la rejilla de 1000 (la misma del inicio). */
const SEPARACION_DEBAJO = 8;

/**
 * El encabezado de todas las pantallas: el título de la app y, debajo, dónde
 * está parado el usuario — "Chile" en la lista de regiones, el nombre de la
 * comuna al entrar en una, "Banners", "Perfil"...
 *
 * El título es EL MISMO del inicio: la imagen vigente (normal o de fecha
 * especial) con la posición y el tamaño que fija el administrador en
 * "Título". Si se mueve o se agranda allá, se mueve igual en todas las
 * pantallas, porque se mide exactamente igual: desde el borde de arriba de
 * la pantalla y en la rejilla de 1000 del ancho.
 *
 * El alto del encabezado se ajusta a lo que ocupan el título y el subtítulo
 * (nunca más que el perímetro de 340 del inicio): con el título arriba y
 * chico, el contenido de la pantalla empieza antes.
 *
 * `onVolver` dibuja la flecha de regreso superpuesta, sin descolocar el
 * título: si la flecha ocupara sitio en la fila, el logo dejaría de estar
 * centrado en la pantalla.
 */
export function EncabezadoMarca({ subtitulo, onVolver }: { subtitulo: string; onVolver?: () => void }) {
  const { width } = useWindowDimensions();
  // Todas las pantallas lo ponen dentro de un área segura de arriba: esta
  // franja (la barra de estado) ya está reservada fuera del encabezado.
  const insets = useSafeAreaInsets();
  const marca = useMarca();
  const unidad = width / 1000;
  // El subtítulo, del mismo tamaño que el nombre de la comuna del inicio (45
  // de 1000 del ancho, con los mismos topes): así título y subtítulo forman
  // exactamente el mismo bloque en todas las pantallas y el tope que evita
  // que el título pise el contenido actúa igual que allá.
  const tamanoSubtitulo = Math.min(26, Math.max(14, Math.round((width * 45) / 1000)));
  const altoSubtitulo = Math.round(tamanoSubtitulo * 1.3);

  // Hasta dónde llega lo dibujado, medido desde el borde físico de arriba.
  const perimetro = PERIMETRO_ALTO * unidad;
  const fondoLogo = marca.centroY * unidad + (marca.alto * unidad) / 2;
  const fondo = Math.min(perimetro, fondoLogo + SEPARACION_DEBAJO * unidad + altoSubtitulo + Spacing.three);
  const alto = Math.max(0, Math.round(fondo - insets.top));

  return (
    <View style={[styles.bloque, { height: alto }]}>
      <TituloPosicionado
        unidad={unidad}
        altoPerimetro={PERIMETRO_ALTO}
        recorteArriba={insets.top}
        medidas={{ centroX: marca.centroX, ancho: marca.ancho, alto: marca.alto, centroY: marca.centroY }}
        url={marca.url}
        debajo={
          <Text style={[styles.subtitulo, { fontSize: tamanoSubtitulo, lineHeight: altoSubtitulo }]} numberOfLines={1}>
            {subtitulo}
          </Text>
        }
      />

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
    alignSelf: 'stretch',
    // Red de seguridad: con una medida imposible, el título no se sale del
    // encabezado ni pisa el contenido.
    overflow: 'hidden',
  },
  subtitulo: {
    fontFamily: Fonts.light,
    color: '#8A8A8A',
    maxWidth: '70%',
    textAlign: 'center',
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
