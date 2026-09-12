import { Image } from 'expo-image';
import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';
import type { PublicacionResumen } from '@/lib/catalog';

type Props = {
  publicacion: PublicacionResumen;
  onPress: (id: string) => void;
};

/**
 * Envuelta en `memo`: en una lista de 20-30 comercios, sin esto React vuelve
 * a renderizar TODAS las tarjetas cada vez que cambia algo arriba (tocar una
 * categoría, abrir el selector de comuna) aunque sus datos no hayan cambiado.
 * `onPress` en el padre está memoizado con useCallback para que la
 * comparación funcione de verdad.
 *
 * Layout según la plantilla del cliente: una sola tarjeta de esquinas
 * redondeadas, con un panel blanco angosto a la izquierda — el ícono de la
 * categoría arriba (no centrado) con una sombra suave debajo, como si
 * flotara — y el panel negro con título, foto del producto al centro y
 * nombre + precio abajo, todo en Poppins.
 */
function PublicacionCardComponent({ publicacion, onPress }: Props) {
  const producto = useMemo(
    () => [...publicacion.productos].sort((a, b) => a.orden - b.orden)[0],
    [publicacion.productos],
  );
  const icono = publicacion.categoria?.icono ?? '🛍️';
  const handlePress = useCallback(() => onPress(publicacion.id), [onPress, publicacion.id]);

  return (
    <Pressable onPress={handlePress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.iconPanel}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconGlyph}>{icono}</Text>
        </View>
        <View style={styles.iconShadow} />
      </View>

      <View style={styles.contentPanel}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {publicacion.titulo}
          </Text>
          {publicacion.destacado && <Text style={styles.destacado}>★</Text>}
        </View>

        <View style={styles.imageWrap}>
          {producto?.imagen_url ? (
            <Image source={{ uri: producto.imagen_url }} style={styles.productImage} contentFit="contain" />
          ) : (
            <View style={[styles.productImage, styles.productImageFallback]} />
          )}
        </View>

        {producto && (
          <View style={styles.bottomRow}>
            <Text style={styles.productName} numberOfLines={1}>
              {producto.nombre}
            </Text>
            <Text style={styles.price}>$ {producto.precio.toLocaleString('es-CL')}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export const PublicacionCard = memo(PublicacionCardComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    height: 218,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#0D0D0D',
  },
  pressed: {
    opacity: 0.9,
  },
  iconPanel: {
    width: '23%',
    backgroundColor: Colors.card,
    alignItems: 'center',
    paddingTop: 10,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: {
    fontFamily: Fonts.light,
    fontSize: 28,
  },
  // "Sombra en el piso" debajo del círculo: una elipse que se desvanece hacia
  // los bordes. `radial-gradient` viene en el core de React Native 0.86.
  iconShadow: {
    width: 46,
    height: 12,
    marginTop: 6,
    experimental_backgroundImage: 'radial-gradient(ellipse closest-side, rgba(0,0,0,0.30), rgba(0,0,0,0))',
  },
  contentPanel: {
    flex: 1,
    paddingTop: 18,
    paddingLeft: 19,
    paddingRight: 12,
    paddingBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    flexShrink: 1,
    fontFamily: Fonts.medium,
    fontSize: 24,
    lineHeight: 32,
    color: Colors.text,
  },
  destacado: {
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.accent,
  },
  imageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
  },
  productImage: {
    width: '72%',
    height: '100%',
  },
  productImageFallback: {
    backgroundColor: Colors.surface,
    borderRadius: 6,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productName: {
    flexShrink: 1,
    fontFamily: Fonts.light,
    fontSize: 20,
    lineHeight: 26,
    color: Colors.text,
  },
  price: {
    marginLeft: 8,
    fontFamily: Fonts.light,
    fontSize: 20,
    lineHeight: 26,
    color: Colors.text,
  },
});
