import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import { Text } from '@/components/ui/Texto';

/** Velocidad del deslizamiento: lenta, para que se alcance a leer. */
const MS_POR_PIXEL = 35;
/** Pausa en cada extremo antes de volver (y tras soltarlo con el dedo). */
const PAUSA_MS = 1500;

/**
 * Un texto de una línea que, si no cabe, se desliza solo y despacio hacia un
 * lado y vuelve UNA vez, para no molestar (pedido del cliente); también se
 * puede arrastrar con el dedo y, al soltarlo, vuelve solo al inicio (pedido del cliente: que los nombres largos se lean enteros,
 * en vez de cortarse con "…"). Si cabe, se ve quieto como un texto común.
 *
 * Es un ScrollView horizontal y el toque va dentro de él (`onPress`): metido
 * en un Pressable de afuera, Android no lo deja arrastrar y el arrastre
 * terminaba contando como toque (abría WhatsApp).
 */
export function TextoDeslizante({
  texto,
  style,
  onPress,
  onLongPress,
  onPressOut,
  delayLongPress,
}: {
  texto: string;
  style?: StyleProp<TextStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  onPressOut?: () => void;
  delayLongPress?: number;
}) {
  const [anchoCaja, setAnchoCaja] = useState(0);
  const [anchoTexto, setAnchoTexto] = useState(0);
  const sobra = anchoCaja > 0 && anchoTexto > 0 ? anchoTexto - anchoCaja : 0;

  const scroll = useRef<ScrollView>(null);
  const x = useRef(new Animated.Value(0)).current;
  const estado = useRef({
    sobra: 0,
    posicion: 0,
    animacion: null as Animated.CompositeAnimation | null,
    vivo: false,
    /** Ya llegó al final: lo que queda es volver al inicio y quedarse ahí. */
    llego: false,
  });
  estado.current.sobra = sobra;

  // La animación mueve el desplazamiento del ScrollView.
  useEffect(() => {
    const id = x.addListener(({ value }) => {
      estado.current.posicion = value;
      scroll.current?.scrollTo({ x: value, animated: false });
    });
    return () => x.removeListener(id);
  }, [x]);

  /** Espera y va al final; después, vuelve al inicio y se detiene. */
  function ciclo() {
    const e = estado.current;
    if (!e.vivo || e.sobra <= 1) return;
    const destino = e.llego ? 0 : e.sobra;
    if (destino === 0 && e.posicion <= 0) return;
    const animacion = Animated.sequence([
      Animated.delay(PAUSA_MS),
      Animated.timing(x, {
        toValue: destino,
        duration: Math.abs(destino - e.posicion) * MS_POR_PIXEL,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    ]);
    e.animacion = animacion;
    animacion.start(({ finished }) => {
      if (!finished) return;
      e.llego = true;
      ciclo();
    });
  }

  function detener() {
    estado.current.animacion?.stop();
    estado.current.animacion = null;
  }

  useEffect(() => {
    detener();
    x.setValue(0);
    estado.current.llego = false;
    estado.current.vivo = sobra > 1;
    ciclo();
    return () => {
      estado.current.vivo = false;
      detener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sobra, texto]);

  /** Al soltarlo con el dedo, vuelve solo al inicio (tras la pausa). */
  function alSoltar(posicion: number) {
    detener();
    estado.current.llego = true;
    x.setValue(Math.max(0, Math.min(estado.current.sobra, posicion)));
    ciclo();
  }

  const tocable = !!(onPress || onLongPress);
  const contenido = (
    <Text style={style} numberOfLines={1} onLayout={(e) => setAnchoTexto(Math.ceil(e.nativeEvent.layout.width))}>
      {texto}
    </Text>
  );

  return (
    <ScrollView
      ref={scroll}
      horizontal
      // Tan ancho como el texto, pero nunca más que el espacio disponible.
      style={[styles.caja, anchoTexto > 0 && { width: anchoTexto }]}
      scrollEnabled={sobra > 1}
      // Si cabe y no tiene toque propio, deja pasar el dedo a lo de debajo.
      pointerEvents={sobra > 1 || tocable ? 'auto' : 'none'}
      showsHorizontalScrollIndicator={false}
      overScrollMode="never"
      bounces={false}
      scrollEventThrottle={16}
      onLayout={(e) => setAnchoCaja(Math.floor(e.nativeEvent.layout.width))}
      onScrollBeginDrag={detener}
      onScrollEndDrag={(e) => alSoltar(e.nativeEvent.contentOffset.x)}
      onMomentumScrollEnd={(e) => alSoltar(e.nativeEvent.contentOffset.x)}
      accessible={!tocable}
      accessibilityLabel={texto}>
      {tocable ? (
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          onPressOut={onPressOut}
          delayLongPress={delayLongPress}
          accessibilityRole="button"
          accessibilityLabel={texto}>
          {contenido}
        </Pressable>
      ) : (
        contenido
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  caja: {
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: '100%',
  },
});
