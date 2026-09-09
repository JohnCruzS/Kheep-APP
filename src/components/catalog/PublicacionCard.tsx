import { Image } from 'expo-image';
import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Spacing } from '@/constants/theme';
import type { PublicacionResumen } from '@/lib/catalog';

type Props = {
  publicacion: PublicacionResumen;
  onPress: (id: string) => void;
};

/**
 * Envuelta en `memo`: en una lista de 20-30 comercios, sin esto React vuelve
 * a renderizar TODAS las tarjetas cada vez que cambia algo arriba (escribir
 * en el buscador, abrir el selector de comuna) aunque los datos de cada
 * tarjeta no hayan cambiado — se nota como "tirones" al hacer scroll justo
 * después de tocar algo. `onPress` en el padre está memoizado con
 * useCallback para que esta comparación funcione de verdad.
 *
 * Layout según el mockup del cliente: panel blanco angosto a la izquierda
 * con el icono de la categoría en un círculo rojo, y a la derecha una
 * tarjeta negra con el título arriba, la foto del producto grande al medio
 * y nombre + precio abajo.
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
            <Image source={{ uri: producto.imagen_url }} style={styles.productImage} contentFit="cover" />
          ) : (
            <View style={[styles.productImage, styles.productImageFallback]} />
          )}
        </View>

        {producto && (
          <View style={styles.bottomRow}>
            <Text style={styles.productName} numberOfLines={1}>
              {producto.nombre}
            </Text>
            <Text style={styles.price}>${producto.precio.toLocaleString('es-CL')}</Text>
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
    height: 340,
  },
  pressed: {
    opacity: 0.9,
  },
  iconPanel: {
    width: '30%',
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: {
    fontSize: 34,
  },
  contentPanel: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    padding: Spacing.four,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    flexShrink: 1,
    fontFamily: Fonts.extraBold,
    fontSize: 26,
    color: Colors.text,
  },
  destacado: {
    fontSize: 14,
    color: Colors.accent,
  },
  imageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.three,
  },
  productImage: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
  },
  productImageFallback: {
    backgroundColor: Colors.surface,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productName: {
    fontFamily: Fonts.medium,
    fontSize: 18,
    color: '#8A8A90',
  },
  price: {
    fontFamily: Fonts.bold,
    fontSize: 20,
    color: Colors.text,
  },
});
