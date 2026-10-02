import { Image } from 'expo-image';
import { ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormScroll } from '@/components/ui/FormScroll';
import { TarjetaClaraProvider } from '@/components/ui/TarjetaClara';
import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { FORMATO_RECORTE } from '@/lib/rejilla';

/**
 * Proporciones de la maqueta del cliente para publicar y editar una
 * publicación, como fracción del ancho de la pantalla.
 */
const PROPORCION = {
  /** Hasta dónde baja el negro de arriba, por detrás de la tarjeta. */
  negro: 1.045,
  /** Dónde empieza la tarjeta blanca, desde el borde de arriba. */
  inicioTarjeta: 0.377,
  /** Margen a cada lado de la tarjeta. */
  margen: 0.03,
  /** Diámetro de la foto del comercio. */
  foto: 0.328,
  /**
   * Recuadro de la foto del producto. En la maqueta es 39,5 % x 35,5 %; acá
   * va un poco más chico porque la app tiene la barra de pestañas abajo, que
   * la maqueta no muestra, y así "Guardar" entra sin desplazar.
   */
  productoAncho: 0.34,
  // Misma forma que el recorte y que la foto en la tarjeta (19:15).
  productoAlto: (0.34 * FORMATO_RECORTE.producto[1]) / FORMATO_RECORTE.producto[0],
};
/** Gris claro de la maqueta, por debajo de la tarjeta. */
const GRIS_FONDO = '#D8D8D8';

/** Medidas del recuadro de la foto de un producto, para esta pantalla. */
export function useMedidaProducto() {
  const { width } = useWindowDimensions();
  return {
    width: Math.round(width * PROPORCION.productoAncho),
    height: Math.round(width * PROPORCION.productoAlto),
  };
}

/**
 * El diseño de publicar y de editar una publicación (maqueta del cliente):
 * negro arriba, que baja por detrás de la tarjeta; gris claro debajo; una
 * tarjeta blanca con los campos en líneas; y la foto del comercio, redonda,
 * montada sobre el borde de arriba de la tarjeta.
 *
 * La foto y la tarjeta van dentro de la misma zona que se desplaza, así suben
 * y bajan juntas: con la foto fija, los campos pasaban por detrás de ella.
 */
export function LienzoPublicacion({
  fotoUri,
  onElegirFoto,
  onVolver,
  children,
}: {
  /** La foto del comercio; sin ella se ve el círculo gris. */
  fotoUri: string | null;
  onElegirFoto?: () => void;
  /** Si viene, muestra la flecha para volver (editar). */
  onVolver?: () => void;
  children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const negro = Math.round(width * PROPORCION.negro);
  const inicio = Math.round(width * PROPORCION.inicioTarjeta);
  const margen = Math.round(width * PROPORCION.margen);
  const foto = Math.round(width * PROPORCION.foto);
  const circulo = { width: foto, height: foto, borderRadius: foto / 2 };

  return (
    <View style={styles.pantalla}>
      <View style={[styles.negro, { height: negro }]} />

      {/* Dentro de la tarjeta blanca los campos son líneas y el botón
          secundario es negro (ver TarjetaClara). */}
      <TarjetaClaraProvider value>
        <FormScroll
          style={styles.zona}
          contentContainerStyle={[
            styles.zonaContenido,
            // Arranca a la altura de la parte de arriba del círculo, no de la
            // tarjeta: así el círculo no se corta.
            { paddingTop: inicio - foto / 2, paddingHorizontal: margen },
          ]}>
          <Pressable onPress={onElegirFoto} disabled={!onElegirFoto} style={styles.foto}>
            {fotoUri ? (
              <Image source={{ uri: fotoUri }} style={circulo} contentFit="cover" />
            ) : (
              <View style={[circulo, styles.fotoVacia]} />
            )}
          </Pressable>
          <View style={[styles.tarjeta, { marginTop: -foto / 2, paddingTop: foto / 2 - Spacing.one }]}>
            {children}
          </View>
        </FormScroll>
      </TarjetaClaraProvider>

      {onVolver && (
        <Pressable
          onPress={onVolver}
          hitSlop={12}
          style={[styles.volver, { top: insets.top + Spacing.two }]}
          accessibilityRole="button"
          accessibilityLabel="Volver">
          <Text style={styles.volverLabel}>‹</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: GRIS_FONDO,
  },
  negro: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.background,
  },
  zona: {
    flex: 1,
  },
  zonaContenido: {
    flexGrow: 1,
    paddingBottom: Spacing.three,
  },
  foto: {
    alignItems: 'center',
    // Por encima de la tarjeta blanca, que viene después en el dibujo.
    zIndex: 2,
    elevation: 2,
  },
  fotoVacia: {
    backgroundColor: '#B3B3B3',
  },
  tarjeta: {
    flexGrow: 1,
    backgroundColor: Colors.card,
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
  },
  volver: {
    position: 'absolute',
    left: Spacing.three,
  },
  volverLabel: {
    fontFamily: Fonts.light,
    fontSize: 34,
    lineHeight: 38,
    color: Colors.accent,
  },
});
