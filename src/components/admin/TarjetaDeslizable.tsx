import { useRef, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Text } from '@/components/ui/Texto';
import { Colors, Fonts } from '@/constants/theme';

/** Cuánto hay que arrastrar (en píxeles) para que cuente como decisión. */
const UMBRAL = 110;

/**
 * Una publicación para decidir con el dedo, en Aprobar (pedido del cliente):
 *
 *  - arrastrarla a la DERECHA la rechaza;
 *  - arrastrarla hacia ARRIBA, como pasando a la siguiente de un feed, la
 *    aprueba ("por descarte": si no se rechazó, se aprueba).
 *
 * Mientras se arrastra se ve qué va a pasar ("Rechazar" o "Aprobar"). Si se
 * suelta antes del umbral, la tarjeta vuelve a su lugar y no pasa nada.
 *
 * Deslizar a la izquierda no se toma: así se siguen pasando los productos
 * de la galería de la tarjeta.
 */
export function TarjetaDeslizable({
  children,
  onRechazar,
  onAprobar,
  puedeAprobar = true,
  onAprobarBloqueado,
  soloRechazar,
}: {
  children: ReactNode;
  onRechazar: () => void;
  onAprobar: () => void;
  /** false = todavía hay fotos por ver: deslizar hacia arriba no aprueba. */
  puedeAprobar?: boolean;
  /** Se intentó aprobar sin haber visto todas las fotos. */
  onAprobarBloqueado?: () => void;
  /** Solo se arrastra a la derecha para rechazar (banners: se aprueban con dos toques). */
  soloRechazar?: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const pan = useRef(new Animated.ValueXY()).current;
  // En refs: el PanResponder se arma una sola vez.
  const accionesRef = useRef({ onRechazar, onAprobar, puedeAprobar, onAprobarBloqueado, soloRechazar });
  accionesRef.current = { onRechazar, onAprobar, puedeAprobar, onAprobarBloqueado, soloRechazar };

  const volver = () => Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
  const salir = (hacia: { x: number; y: number }, despues: () => void) =>
    Animated.timing(pan, { toValue: hacia, duration: 180, useNativeDriver: false }).start(() => despues());

  const responder = useRef(
    PanResponder.create({
      // Solo hacia la derecha o hacia arriba (lo demás sigue siendo de la
      // tarjeta: la galería de productos y los toques).
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        (g.dx > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5) ||
        (!accionesRef.current.soloRechazar && g.dy < -12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5),
      onPanResponderMove: (_e, g) => {
        // Se mueve solo en el eje del gesto: a la derecha o hacia arriba.
        if (Math.abs(g.dx) > Math.abs(g.dy) || accionesRef.current.soloRechazar) pan.setValue({ x: Math.max(0, g.dx), y: 0 });
        else pan.setValue({ x: 0, y: Math.min(0, g.dy) });
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dx > UMBRAL && Math.abs(g.dx) > Math.abs(g.dy)) {
          salir({ x: width, y: 0 }, () => accionesRef.current.onRechazar());
        } else if (!accionesRef.current.soloRechazar && g.dy < -UMBRAL && Math.abs(g.dy) > Math.abs(g.dx)) {
          // Hay que haber visto todas las fotos para aprobar deslizando.
          if (accionesRef.current.puedeAprobar) {
            salir({ x: 0, y: -height }, () => accionesRef.current.onAprobar());
          } else {
            volver();
            accionesRef.current.onAprobarBloqueado?.();
          }
        } else {
          volver();
        }
      },
      onPanResponderTerminate: volver,
    }),
  ).current;

  const opacidadRechazar = pan.x.interpolate({ inputRange: [0, UMBRAL], outputRange: [0, 1], extrapolate: 'clamp' });
  const opacidadAprobar = pan.y.interpolate({ inputRange: [-UMBRAL, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View>
      <Animated.View {...responder.panHandlers} style={{ transform: pan.getTranslateTransform() }}>
        {children}
        {/* Lo que va a pasar al soltar. */}
        <Animated.View pointerEvents="none" style={[styles.etiqueta, styles.etiquetaRechazar, { opacity: opacidadRechazar }]}>
          <Text style={[styles.etiquetaTexto, { color: Colors.accent }]}>Rechazar</Text>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.etiqueta, styles.etiquetaAprobar, { opacity: opacidadAprobar }]}>
          <Text style={[styles.etiquetaTexto, { color: Colors.success }]}>Aprobar</Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  etiqueta: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 2,
  },
  etiquetaRechazar: {
    top: 16,
    left: 16,
    borderColor: Colors.accent,
  },
  etiquetaAprobar: {
    bottom: 16,
    alignSelf: 'center',
    borderColor: Colors.success,
  },
  etiquetaTexto: {
    fontFamily: Fonts.medium,
    fontSize: 22,
  },
});
