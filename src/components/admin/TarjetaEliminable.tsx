import { useRef } from 'react';
import { Alert, Animated, PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';

import { PublicacionCard } from '@/components/catalog/PublicacionCard';
import { Text } from '@/components/ui/Texto';
import { Colors, Fonts } from '@/constants/theme';
import type { PublicacionResumen } from '@/lib/catalog';

/** Cuánto hay que arrastrar (en píxeles) para que cuente. */
const UMBRAL = 110;

/**
 * Una publicación que se elimina arrastrando su parte blanca (la de la foto
 * del comercio) hacia la derecha (pedido del cliente). Antes de eliminarla se
 * pide confirmación; si se cancela, vuelve a su lugar. El resto de la tarjeta
 * sigue igual: la galería de productos se pasa con el dedo y las fotos se
 * abren al tocarlas.
 */
export function TarjetaEliminable({
  publicacion,
  onVerFoto,
  onEliminar,
}: {
  publicacion: PublicacionResumen;
  onVerFoto: (url: string) => void;
  /** Elimina la publicación (ya confirmada). */
  onEliminar: () => Promise<void>;
}) {
  const { width } = useWindowDimensions();
  const x = useRef(new Animated.Value(0)).current;
  const onEliminarRef = useRef(onEliminar);
  onEliminarRef.current = onEliminar;
  const tituloRef = useRef(publicacion.titulo);
  tituloRef.current = publicacion.titulo;

  const volver = () => Animated.spring(x, { toValue: 0, useNativeDriver: false }).start();

  const responder = useRef(
    PanResponder.create({
      // Solo hacia la derecha y solo desde la parte blanca (los handlers van
      // en ella): así no se confunde con pasar los productos.
      onMoveShouldSetPanResponderCapture: (_e, g) => g.dx > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_e, g) => x.setValue(Math.max(0, g.dx)),
      onPanResponderRelease: (_e, g) => {
        if (g.dx < UMBRAL) {
          volver();
          return;
        }
        Alert.alert('Eliminar publicación', `"${tituloRef.current}" sale del catálogo.`, [
          { text: 'Cancelar', style: 'cancel', onPress: volver },
          {
            text: 'Eliminar',
            style: 'destructive',
            onPress: () =>
              Animated.timing(x, { toValue: width, duration: 180, useNativeDriver: false }).start(() => {
                onEliminarRef.current().catch(volver);
              }),
          },
        ]);
      },
      onPanResponderTerminate: volver,
    }),
  ).current;

  const opacidad = x.interpolate({ inputRange: [0, UMBRAL], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <View>
      <Animated.View style={{ transform: [{ translateX: x }] }}>
        <PublicacionCard
          publicacion={publicacion}
          onContactar={() => {}}
          onVerFoto={onVerFoto}
          panelHandlers={responder.panHandlers}
        />
        <Animated.View pointerEvents="none" style={[styles.etiqueta, { opacity: opacidad }]}>
          <Text style={styles.etiquetaTexto}>Eliminar</Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  etiqueta: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  etiquetaTexto: {
    fontFamily: Fonts.medium,
    fontSize: 22,
    color: Colors.accent,
  },
});
