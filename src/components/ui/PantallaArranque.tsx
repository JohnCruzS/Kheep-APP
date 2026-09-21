import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import marcaKheep from '../../../assets/images/marca-arranque.png';
import { Colors, Fonts, Spacing } from '@/constants/theme';

/**
 * Ancho de la marca, como proporción del ancho de la pantalla. La imagen va
 * recortada a la marca misma (sin el aire alrededor), así que este número es
 * lo que se ve de verdad.
 *
 * Es el mismo tamaño al que quedó el splash nativo de Android (38 % de su
 * lienzo de 288): el paso del splash a la app no se nota, y todo el arranque
 * se ve como UNA sola vista.
 */
const PROPORCION_MARCA = 0.28;
/** Alto ÷ ancho de assets/images/marca-arranque.png (333 × 313). */
const PROPORCION_IMAGEN_ALTO = 313 / 333;

/**
 * La pantalla de arranque: fondo negro con la marca centrada y nada más.
 *
 * Antes eran dos vistas distintas —el splash con la marca y, después, una
 * ruedita roja sobre negro— y el salto entre ambas se veía como si la app se
 * reiniciara. Ahora todos los momentos de espera del arranque (fuentes,
 * sesión, comuna guardada, identificación por GPS) muestran exactamente esto.
 *
 * Sin barra de estado: durante el arranque no hay nada que mirar arriba, y la
 * hora y la batería encima del negro rompían la vista completa.
 */
export function PantallaArranque({ mensaje }: { mensaje?: string }) {
  const { width } = useWindowDimensions();
  const ancho = Math.round(width * PROPORCION_MARCA);

  return (
    <View style={styles.pantalla}>
      <StatusBar hidden />
      <Image
        source={marcaKheep}
        style={{ width: ancho, height: Math.round((ancho * PROPORCION_IMAGEN_ALTO)) }}
        contentFit="contain"
        accessibilityRole="image"
        accessibilityLabel="Kheep"
      />
      {/* Sin ruedita de carga: solo el texto, cuando hay algo que contar. */}
      {mensaje ? <Text style={styles.mensaje}>{mensaje}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mensaje: {
    position: 'absolute',
    bottom: '22%',
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.four,
    textAlign: 'center',
  },
});
