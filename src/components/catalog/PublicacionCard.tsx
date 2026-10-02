import { Image } from 'expo-image';
import { memo, useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Texto';

import { Colors, Fonts } from '@/constants/theme';
import { REJILLA, u } from '@/lib/rejilla';
import type { PublicacionResumen } from '@/lib/catalog';

type Props = {
  publicacion: PublicacionResumen;
  /** Tocar el título contacta directo por WhatsApp (documento EDIT APP). */
  onContactar: (publicacion: PublicacionResumen) => void;
  /** Tocar la foto la abre completa. */
  onVerFoto: (url: string) => void;
};

/**
 * Envuelta en `memo`: en una lista de 20-30 comercios, sin esto React vuelve
 * a renderizar TODAS las tarjetas cada vez que cambia algo arriba (tocar una
 * categoría, abrir el selector de comuna) aunque sus datos no hayan cambiado.
 * Los callbacks del padre están memoizados con useCallback para que la
 * comparación funcione de verdad.
 *
 * Layout según la plantilla del cliente: una sola tarjeta de esquinas
 * redondeadas con un panel blanco angosto a la izquierda —la foto del
 * comercio arriba, con una sombra suave debajo, como si flotara— y, a la
 * derecha, la foto del producto ocupando TODO el panel, apenas oscurecida,
 * con el nombre del comercio arriba y el del producto y su precio abajo,
 * sombreados para que se lean sobre cualquier foto.
 */
function PublicacionCardComponent({ publicacion, onContactar, onVerFoto }: Props) {
  const productos = useMemo(
    () => [...publicacion.productos].sort((a, b) => a.orden - b.orden),
    [publicacion.productos],
  );
  // Los productos son una galería que se pasa con el dedo (ya no avanza
  // sola, pedido del cliente); el nombre y el precio de abajo son siempre los
  // del que se está viendo.
  const [indice, setIndice] = useState(0);
  const [ancho, setAncho] = useState(0);
  const producto = productos[Math.min(indice, productos.length - 1)];

  function medir(e: LayoutChangeEvent) {
    setAncho(Math.round(e.nativeEvent.layout.width));
  }

  function alDeslizar(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (ancho <= 0) return;
    const visible = Math.max(0, Math.min(productos.length - 1, Math.round(e.nativeEvent.contentOffset.x / ancho)));
    setIndice((anterior) => (anterior === visible ? anterior : visible));
  }

  return (
    /* La tarjeta no lleva a ninguna pantalla: tiene todo lo que hace falta.
       Sus acciones son la foto del comercio y la del producto (se abren
       completas) y el nombre, que contacta por WhatsApp. */
    <View style={styles.row}>
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

      <View style={styles.contentPanel} onLayout={medir}>
        {/* La galería llena el panel entero, por debajo de los textos. */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={productos.length > 1}
          onScroll={alDeslizar}
          onMomentumScrollEnd={alDeslizar}
          scrollEventThrottle={16}
          style={StyleSheet.absoluteFill}>
          {productos.map((p) => (
            <Pressable
              key={p.imagen_url ?? p.nombre}
              style={[styles.pagina, { width: ancho }]}
              onPress={() => p.imagen_url && onVerFoto(p.imagen_url)}
              disabled={!p.imagen_url}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Ver foto de ${p.nombre}`}>
              {p.imagen_url ? (
                <Image source={{ uri: p.imagen_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.sinFoto]} />
              )}
            </Pressable>
          ))}
        </ScrollView>

        {/* Semioscurecido: la foto se ve entera, pero el texto encima se lee
            aunque la imagen sea clara. */}
        <View style={styles.velo} pointerEvents="none" />

        {/* Los textos van encima de la foto. `box-none` deja pasar el dedo a la
            galería en todo lo que no sea el propio título. */}
        <View style={styles.textos} pointerEvents="box-none">
          <View style={styles.titleRow} pointerEvents="box-none">
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

          {producto && (
            <View style={styles.bottomRow} pointerEvents="none">
              <Text style={styles.productName} numberOfLines={1}>
                {producto.nombre}
              </Text>
              {producto.precio > 0 && (
                <Text style={styles.price}>$ {producto.precio.toLocaleString('es-CL')}</Text>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export const PublicacionCard = memo(PublicacionCardComponent);

/** Sombra de los textos sobre la foto, para que se lean siempre. */
const SOMBRA = {
  textShadowColor: 'rgba(0,0,0,0.85)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
} as const;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    height: u(REJILLA.galeriaAlto),
    borderRadius: u(REJILLA.curvatura),
    overflow: 'hidden',
    backgroundColor: '#0D0D0D',
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
    overflow: 'hidden',
  },
  pagina: {
    height: '100%',
  },
  sinFoto: {
    backgroundColor: Colors.surface,
  },
  velo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  textos: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
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
  title: {
    flexShrink: 1,
    fontFamily: Fonts.medium,
    fontSize: 24,
    lineHeight: 32,
    color: Colors.text,
    ...SOMBRA,
  },
  destacado: {
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.accent,
    ...SOMBRA,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productName: {
    flexShrink: 1,
    fontFamily: Fonts.delgada,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.text,
    ...SOMBRA,
  },
  price: {
    marginLeft: 8,
    fontFamily: Fonts.light,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.text,
    ...SOMBRA,
  },
});
