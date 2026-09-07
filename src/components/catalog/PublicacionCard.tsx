import { Image } from 'expo-image';
import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import type { PublicacionResumen } from '@/lib/catalog';

const BADGE_SIZE = 56;

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
 */
function PublicacionCardComponent({ publicacion, onPress }: Props) {
  const producto = useMemo(
    () => [...publicacion.productos].sort((a, b) => a.orden - b.orden)[0],
    [publicacion.productos],
  );
  const icono = publicacion.categoria?.icono ?? '🛍️';
  const handlePress = useCallback(() => onPress(publicacion.id), [onPress, publicacion.id]);

  return (
    <Pressable onPress={handlePress} style={({ pressed }) => [styles.wrapper, pressed && styles.pressed]}>
      <View style={styles.badge}>
        <Text style={styles.badgeIcon}>{icono}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {publicacion.titulo}
          </Text>
          {publicacion.destacado && <Text style={styles.destacado}>★</Text>}
        </View>

        <Text style={styles.subtitle} numberOfLines={1}>
          {[publicacion.categoria?.nombre, publicacion.comuna?.nombre].filter(Boolean).join(' · ')}
        </Text>

        <View style={styles.imageRow}>
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
  wrapper: {
    position: 'relative',
    paddingTop: BADGE_SIZE / 2,
  },
  pressed: {
    opacity: 0.9,
  },
  badge: {
    position: 'absolute',
    top: 0,
    left: Spacing.three,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  badgeIcon: {
    fontSize: 24,
  },
  card: {
    backgroundColor: '#0D0D0D',
    borderRadius: Radius.card - 4,
    paddingTop: BADGE_SIZE / 2 + Spacing.two,
    paddingBottom: Spacing.three,
    paddingHorizontal: Spacing.three,
    gap: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: BADGE_SIZE + Spacing.two,
  },
  title: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  destacado: {
    fontSize: 14,
    color: Colors.accent,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    paddingLeft: BADGE_SIZE + Spacing.two,
    marginTop: 2,
  },
  imageRow: {
    alignItems: 'flex-end',
    marginTop: Spacing.two,
  },
  productImage: {
    width: 88,
    height: 66,
    borderRadius: 14,
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
    fontSize: 13,
    color: Colors.textMuted,
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
});
