import { Image } from 'expo-image';
import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';
import { REJILLA, u } from '@/lib/rejilla';
import type { PublicacionResumen } from '@/lib/catalog';

type Props = {
  publicacion: PublicacionResumen;
  onPress: (id: string) => void;
  /** Tocar el título contacta directo por WhatsApp (documento EDIT APP). */
  onContactar: (publicacion: PublicacionResumen) => void;
  /** Tocar la foto la abre completa, sin entrar a la publicación. */
  onVerFoto: (url: string) => void;
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
function PublicacionCardComponent({ publicacion, onPress, onContactar, onVerFoto }: Props) {
  const producto = useMemo(
    () => [...publicacion.productos].sort((a, b) => a.orden - b.orden)[0],
    [publicacion.productos],
  );
  const handlePress = useCallback(() => onPress(publicacion.id), [onPress, publicacion.id]);

  return (
    <Pressable onPress={handlePress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {/* La foto del comercio, no un icono: se toca para verla completa
          (documento EDIT APP). */}
      <View style={styles.iconPanel}>
        <Pressable
          onPress={() => publicacion.logo_url && onVerFoto(publicacion.logo_url)}
          disabled={!publicacion.logo_url}
          accessibilityRole="imagebutton"
          accessibilityLabel={`Ver la foto de ${publicacion.titulo}`}>
          {publicacion.logo_url ? (
            <Image source={{ uri: publicacion.logo_url }} style={styles.fotoPerfil} contentFit="cover" />
          ) : (
            <View style={[styles.fotoPerfil, styles.fotoPerfilVacia]} />
          )}
        </Pressable>
        <View style={styles.iconShadow} />
      </View>

      <View style={styles.contentPanel}>
        <View style={styles.titleRow}>
          {/* El título es el atajo a WhatsApp; el resto de la tarjeta abre la
              publicación. Por eso el toque se detiene acá. */}
          <Pressable
            style={styles.titlePress}
            onPress={() => onContactar(publicacion)}
            accessibilityRole="button"
            accessibilityLabel={`Contactar a ${publicacion.titulo} por WhatsApp`}>
            <Text style={styles.title} numberOfLines={1}>
              {publicacion.titulo}
            </Text>
          </Pressable>
          {publicacion.destacado && <Text style={styles.destacado}>★</Text>}
        </View>

        <View style={styles.imageWrap}>
          {producto?.imagen_url ? (
            <Pressable
              style={styles.imagePress}
              onPress={() => onVerFoto(producto.imagen_url!)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Ver foto de ${producto.nombre}`}>
              <Image source={{ uri: producto.imagen_url }} style={styles.productImage} contentFit="contain" />
            </Pressable>
          ) : (
            <View style={[styles.productImage, styles.productImageFallback]} />
          )}
        </View>

        {producto && (
          <View style={styles.bottomRow}>
            <Text style={styles.productName} numberOfLines={1}>
              {producto.nombre}
            </Text>
            {producto.precio > 0 && (
              <Text style={styles.price}>$ {producto.precio.toLocaleString('es-CL')}</Text>
            )}
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
    height: u(REJILLA.galeriaAlto),
    borderRadius: u(REJILLA.curvatura),
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
  fotoPerfil: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  fotoPerfilVacia: {
    backgroundColor: '#E4E4E4',
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
  // Toda la línea del título lleva a WhatsApp, no solo las letras: apuntar a
  // un texto corto con el dedo es incómodo (documento EDIT APP).
  titlePress: {
    flex: 1,
    paddingVertical: 4,
  },
  // Solo la imagen, no la franja entera: antes el área tocable ocupaba todo
  // el ancho y tocar AL LADO de la foto la abría igual, cuando ahí lo que
  // corresponde es entrar a la publicación.
  imagePress: {
    width: '72%',
    height: '100%',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
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
    width: '100%',
    height: '100%',
  },
  productImageFallback: {
    width: '72%',
    alignSelf: 'center',
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
    fontSize: 16,
    lineHeight: 22,
    color: Colors.text,
  },
  price: {
    marginLeft: 8,
    fontFamily: Fonts.light,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.text,
  },
});
