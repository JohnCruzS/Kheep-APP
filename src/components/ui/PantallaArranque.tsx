import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import marcaKheep from '../../../assets/images/marca-arranque.png';
import { Colors, Fonts, Spacing } from '@/constants/theme';

/**
 * Ancho de la marca, en dp. La imagen va recortada a la marca misma (sin el
 * aire alrededor), así que este número es lo que se ve de verdad.
 *
 * Tiene que ser un tamaño FIJO, no un porcentaje de la pantalla: Android
 * dibuja el splash nativo con su lienzo de 288 dp a escala 1:1 en cualquier
 * teléfono, y la marca ocupa 328 de sus 864 px (xxhdpi) = 109,3 dp. Con el
 * mismo número, el paso del splash a la app no se nota y todo el arranque se
 * ve como UNA sola vista.
 */
const ANCHO_MARCA = 328 / 3;
/** Alto ÷ ancho de assets/images/marca-arranque.png (948 × 788). */
const PROPORCION_IMAGEN_ALTO = 788 / 948;

/**
 * La pantalla de arranque: fondo negro con la marca centrada y nada más.
 *
 * Antes eran dos vistas distintas —el splash con la marca y, después, una
 * ruedita roja sobre negro— y el salto entre ambas se veía como si la app se
 * reiniciara. Ahora todos los momentos de espera del arranque (fuentes,
 * sesión, comuna guardada, identificación por GPS) muestran exactamente esto.
 *
 * La barra de estado se deja visible, igual que en el splash nativo: Android
 * no deja ocultarla ahí, y si la app la escondía, desaparecía de golpe al
 * pasar de uno a otro y se notaban dos pantallas.
 */
export function PantallaArranque({ mensaje }: { mensaje?: string }) {
  return (
    <View style={styles.pantalla}>
      <StatusBar style="light" />
      <Image
        source={marcaKheep}
        style={styles.marca}
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
  marca: {
    width: ANCHO_MARCA,
    height: ANCHO_MARCA * PROPORCION_IMAGEN_ALTO,
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
