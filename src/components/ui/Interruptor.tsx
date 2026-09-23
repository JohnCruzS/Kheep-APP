import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

import { Colors } from '@/constants/theme';

const ANCHO = 55;
const ALTO = 28;
/** Aire entre el círculo y el borde de la cápsula: el círculo no llena el alto. */
const AIRE = 3.5;
const CIRCULO = ALTO - AIRE * 2;
const RECORRIDO = ANCHO - CIRCULO - AIRE * 2;

/**
 * Interruptor con el diseño del documento EDIT APP: cápsula negra con el
 * círculo blanco a la izquierda cuando está apagado, y roja con el círculo a
 * la derecha cuando está encendido. El círculo ocupa casi todo el alto.
 *
 * Reemplaza al Switch de Android, que tiene una pista delgada y un círculo
 * que sobresale, y no se puede dibujar así.
 */
export function Interruptor({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (valor: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const posicion = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(posicion, { toValue: value ? 1 : 0, duration: 150, useNativeDriver: false }).start();
  }, [value, posicion]);

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      style={disabled && styles.deshabilitado}>
      <Animated.View
        style={[
          styles.capsula,
          {
            backgroundColor: posicion.interpolate({ inputRange: [0, 1], outputRange: ['#000000', Colors.accent] }),
            borderColor: posicion.interpolate({ inputRange: [0, 1], outputRange: ['#3A3A3F', Colors.accent] }),
          },
        ]}>
        <Animated.View
          style={[
            styles.circulo,
            { transform: [{ translateX: posicion.interpolate({ inputRange: [0, 1], outputRange: [0, RECORRIDO] }) }] },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  capsula: {
    width: ANCHO,
    height: ALTO,
    borderRadius: ALTO / 2,
    padding: AIRE - 1,
    // Borde tenue: sobre el negro de las pantallas, la cápsula negra
    // apagada no se distinguía y solo se veía el círculo.
    borderWidth: 1,
    justifyContent: 'center',
  },
  circulo: {
    width: CIRCULO,
    height: CIRCULO,
    borderRadius: CIRCULO / 2,
    backgroundColor: '#FFFFFF',
  },
  deshabilitado: {
    opacity: 0.4,
  },
});
