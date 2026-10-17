import { ReactNode, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View, ViewProps } from 'react-native';

/** Lo que hay que poner en el elemento del que se tira para mover la fila. */
export type PropsAsa = Pick<ViewProps, 'onTouchStart' | 'onTouchEnd'>;

/**
 * La otra forma de agarrar una fila, sin asa: se mantiene apretada (por
 * ejemplo, el nombre de una tarjeta) y después se arrastra. Va en un
 * `Pressable`: `onLongPress` la agarra y `onPressOut` la suelta si no se movió.
 */
export type PropsMantener = { onLongPress: () => void; onPressOut: () => void };

/**
 * Lista que se reordena arrastrando las filas por su asa.
 *
 * Está hecha con `PanResponder` y `Animated`, que vienen con React Native, y
 * no con una librería de arrastre: las conocidas están escritas contra
 * Reanimated 2/3 y este proyecto usa Reanimated 4, donde no funcionan. De paso,
 * el diseño de cada fila queda enteramente en manos de quien la usa.
 *
 * El arrastre va por un asa y no por la fila entera a propósito: la fila tiene
 * sus propios toques —entrar, el interruptor, los botones— y un deslizamiento
 * sobre ella debe seguir desplazando la pantalla. Es como funcionan las listas
 * editables de iOS y Android.
 *
 * Todas las filas miden lo mismo (`altoFila`): eso es lo que permite traducir
 * los píxeles arrastrados a posiciones de la lista.
 */
export function ListaArrastrable<T>({
  datos,
  altoFila,
  claveDe,
  onReordenar,
  children,
  onArrastrando,
}: {
  datos: T[];
  /** Alto de cada fila, separación incluida. */
  altoFila: number;
  claveDe: (item: T) => string;
  /** Se llama al soltar, con la lista ya en el orden nuevo. */
  onReordenar: (nuevos: T[]) => void;
  /**
   * Dibuja una fila. `propsAsa` va en el elemento del que se tira; o bien
   * `propsMantener`, en un `Pressable`, para agarrarla manteniéndola apretada.
   */
  children: (item: T, indice: number, arrastrando: boolean, propsAsa: PropsAsa, propsMantener: PropsMantener) => ReactNode;
  /** Avisa cuando empieza y termina un arrastre (para frenar el desplazamiento de la pantalla). */
  onArrastrando?: (arrastrando: boolean) => void;
}) {
  const [indiceActivo, setIndiceActivo] = useState<number | null>(null);
  const [saltos, setSaltos] = useState(0);

  // En refs además del estado: el PanResponder se crea una sola vez y dentro
  // de sus callbacks el estado quedaría congelado en el valor de entonces.
  const indiceActivoRef = useRef<number | null>(null);
  const saltosRef = useRef(0);
  const datosRef = useRef(datos);
  datosRef.current = datos;
  // También en una ref: el PanResponder se arma una sola vez, y si llamara
  // al `onReordenar` de entonces usaría los datos del primer dibujado (por
  // ejemplo, una lista todavía vacía) y al soltar dejaba la pantalla vacía.
  const onReordenarRef = useRef(onReordenar);
  onReordenarRef.current = onReordenar;
  const onArrastrandoRef = useRef(onArrastrando);
  onArrastrandoRef.current = onArrastrando;
  /** Si la lista ya tomó el gesto (se está moviendo una fila con el dedo). */
  const moviendoRef = useRef(false);

  const desplazamiento = useRef(new Animated.Value(0)).current;

  function soltar() {
    const desde = indiceActivoRef.current;
    const salto = saltosRef.current;
    indiceActivoRef.current = null;
    saltosRef.current = 0;
    setIndiceActivo(null);
    setSaltos(0);
    desplazamiento.setValue(0);
    onArrastrandoRef.current?.(false);
    moviendoRef.current = false;

    if (desde === null || salto === 0) return;
    const nuevos = [...datosRef.current];
    const [movido] = nuevos.splice(desde, 1);
    nuevos.splice(desde + salto, 0, movido);
    onReordenarRef.current(nuevos);
  }

  const responder = useRef(
    PanResponder.create({
      // Solo toma el gesto si hay una fila agarrada por su asa: si no, se
      // comería los toques de las filas y el desplazamiento de la pantalla.
      onMoveShouldSetPanResponder: (_e, gesto) => indiceActivoRef.current !== null && Math.abs(gesto.dy) > 2,
      // Agarrada manteniéndola apretada, el toque lo tiene el `Pressable` de
      // adentro: en la fase de captura la lista se lo quita al empezar a mover.
      onMoveShouldSetPanResponderCapture: (_e, gesto) =>
        indiceActivoRef.current !== null && Math.abs(gesto.dy) > 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        moviendoRef.current = true;
      },
      onPanResponderMove: (_e, gesto) => {
        const desde = indiceActivoRef.current;
        if (desde === null) return;
        desplazamiento.setValue(gesto.dy);

        // Cuántas posiciones cabe el recorrido, sin salirse de la lista.
        const bruto = Math.round(gesto.dy / altoFila);
        const limitado = Math.max(-desde, Math.min(datosRef.current.length - 1 - desde, bruto));
        if (limitado !== saltosRef.current) {
          saltosRef.current = limitado;
          setSaltos(limitado);
        }
      },
      onPanResponderRelease: soltar,
      onPanResponderTerminate: soltar,
    }),
  ).current;

  function agarrar(indice: number) {
    onArrastrandoRef.current?.(true);
    indiceActivoRef.current = indice;
    saltosRef.current = 0;
    desplazamiento.setValue(0);
    setIndiceActivo(indice);
    setSaltos(0);
  }

  /** Cuánto se corre una fila para dejarle el hueco a la que se arrastra. */
  function correr(indice: number): number {
    if (indiceActivo === null || indice === indiceActivo || saltos === 0) return 0;
    const destino = indiceActivo + saltos;
    if (indice > indiceActivo && indice <= destino) return -altoFila;
    if (indice < indiceActivo && indice >= destino) return altoFila;
    return 0;
  }

  return (
    <View {...responder.panHandlers}>
      {datos.map((item, indice) => {
        const activa = indice === indiceActivo;
        const propsAsa: PropsAsa = {
          onTouchStart: () => agarrar(indice),
          // Soltar el asa sin haber movido nada: se cancela el agarre, para
          // que la fila no quede "pegada" al siguiente deslizamiento.
          onTouchEnd: () => {
            if (saltosRef.current === 0) soltar();
          },
        };

        return (
          <Animated.View
            key={claveDe(item)}
            style={[
              styles.fila,
              { height: altoFila },
              activa
                ? { transform: [{ translateY: desplazamiento }], zIndex: 2, elevation: 6 }
                : { transform: [{ translateY: correr(indice) }] },
            ]}>
            {children(item, indice, activa, propsAsa, {
              onLongPress: () => agarrar(indice),
              // Se soltó sin mover: se cancela el agarre. Si la lista tomó el
              // gesto, este aviso llega igual (el `Pressable` pierde el toque)
              // y no hay que soltar: el arrastre recién empieza.
              onPressOut: () => {
                if (indiceActivoRef.current === indice && !moviendoRef.current) soltar();
              },
            })}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: {
    justifyContent: 'center',
  },
});
