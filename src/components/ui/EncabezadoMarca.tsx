import { useRef } from 'react';
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
 * Sin flecha de volver, salvo en las pantallas cuya maqueta la trae
 * (`onVolver`): una "<" roja a la izquierda.
 */
export function EncabezadoMarca({
  subtitulo,
  onDobleToque,
  onVolver,
}: {
  subtitulo: string;
  /** Muestra la flecha "<" roja a la izquierda, que hace esto. */
  onVolver?: () => void;
  /**
   * Dos toques seguidos sobre el título hacen esto (por ejemplo, en Comunas,
   * alternar entre ver todas y solo las visibles). Sin él, el encabezado no
   * responde a toques.
   */
  onDobleToque?: () => void;
}) {
  const ultimoToque = useRef(0);
  function alTocar() {
    const ahora = Date.now();
    // Medio segundo entre un toque y otro, contado desde que el dedo toca la
    // pantalla: con 0,35 s contados al soltar, un doble toque normal con el
    // dedo a veces no alcanzaba a registrarse.
    if (ahora - ultimoToque.current < 500) {
      ultimoToque.current = 0;
      onDobleToque?.();
    } else {
      ultimoToque.current = ahora;
    }
  }
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
      {onDobleToque && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPressIn={alTocar}
          accessibilityRole="button"
          accessibilityHint="Toca dos veces para cambiar lo que se muestra"
        />
      )}
      {onVolver && (
        <Pressable
          style={[styles.volver, { top: Math.max(0, marca.centroY * unidad - insets.top) - 22 }]}
          onPress={onVolver}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Volver">
          <Text style={styles.volverLabel}>{'<'}</Text>
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
  volver: {
    position: 'absolute',
    left: Spacing.five,
    padding: Spacing.one,
  },
  volverLabel: {
    fontFamily: Fonts.delgada,
    fontSize: 30,
    color: '#D90804',
  },
  subtitulo: {
    fontFamily: Fonts.delgada,
    color: '#8A8A8A',
    maxWidth: '70%',
    textAlign: 'center',
  },
});
