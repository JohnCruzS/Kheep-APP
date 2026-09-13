import { ReactNode, createContext, useCallback, useContext, useEffect, useRef } from 'react';
import {
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleProp,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';

import { useAltoTeclado } from '@/hooks/useTeclado';

/** Aire entre el campo que se está escribiendo y el borde del teclado. */
const MARGEN_SOBRE_TECLADO = 16;
/**
 * Espacio que se deja libre DEBAJO del campo enfocado. En estos formularios,
 * justo después del último campo viene el botón que hay que apretar
 * ("Guardar", "Ingresar"); si solo se asegurara que el campo se vea, el botón
 * quedaría tapado y habría que adivinar que la pantalla se desplaza. Con este
 * colchón, al escribir en el último campo el botón ya está a la vista.
 */
const ESPACIO_DEBAJO = 190;

type Valor = {
  /** Lo llama un campo al recibir el foco, para no quedar tapado. */
  registrarCampo: (campo: TextInput | null) => void;
  soltarCampo: (campo: TextInput | null) => void;
};

const ContextoFormulario = createContext<Valor | null>(null);

/** Para los campos: avisan quién tiene el foco. Fuera de un formulario, no hace nada. */
export function useCampoVisible(): Valor {
  return useContext(ContextoFormulario) ?? { registrarCampo: () => {}, soltarCampo: () => {} };
}

/**
 * El envoltorio de cualquier pantalla con campos de escritura.
 *
 * Resuelve en un solo lugar lo que antes se arreglaba pantalla por pantalla:
 * con la pantalla de borde a borde, Android ya no achica la ventana al abrir
 * el teclado (el `adjustResize` del manifiesto dejó de aplicar), así que ni el
 * formulario se corre ni el sistema lleva a la vista el campo enfocado. Acá se
 * hacen las dos cosas:
 *
 *  1. Se reserva el alto real del teclado de ese teléfono, para que el
 *     contenido tenga de verdad hacia dónde desplazarse.
 *  2. Al enfocar un campo se mide dónde quedó y, si el teclado lo tapa (a él o
 *     a lo que viene justo debajo), la pantalla se desplaza solo esa
 *     diferencia. Ni más —para no perder de vista el resto del formulario— ni
 *     menos.
 *
 * `encabezado` es opcional y queda FUERA del área que se desplaza: sirve para
 * una barra o un logo que deben seguir a la vista mientras se escribe.
 */
export function FormScroll({
  children,
  encabezado,
  contentContainerStyle,
  style,
}: {
  children: ReactNode;
  encabezado?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const desplazamiento = useRef(0);
  const campoEnfocado = useRef<TextInput | null>(null);
  const altoTeclado = useAltoTeclado();
  const { height } = useWindowDimensions();

  const acomodar = useCallback(() => {
    const campo = campoEnfocado.current;
    if (!campo || altoTeclado === 0) return;

    // `measureInWindow` da la posición ya dibujada en pantalla, que es contra
    // lo que hay que comparar el borde del teclado.
    campo.measureInWindow((_x, y, _ancho, alto) => {
      const bordeTeclado = height - altoTeclado - MARGEN_SOBRE_TECLADO;
      const excedente = y + alto + ESPACIO_DEBAJO - bordeTeclado;
      if (excedente > 0) {
        scrollRef.current?.scrollTo({ y: desplazamiento.current + excedente, animated: true });
      }
    });
  }, [altoTeclado, height]);

  // Al enfocar, el teclado puede tardar un instante en abrirse: cuando cambia
  // su alto se vuelve a acomodar con la medida ya real.
  useEffect(() => {
    if (altoTeclado === 0) return;
    const id = setTimeout(acomodar, 60);
    return () => clearTimeout(id);
  }, [altoTeclado, acomodar]);

  const valor = useRef<Valor>({
    registrarCampo: (campo) => {
      campoEnfocado.current = campo;
    },
    soltarCampo: (campo) => {
      if (campoEnfocado.current === campo) campoEnfocado.current = null;
    },
  }).current;

  function alEnfocarAlgo() {
    // Cambiar de un campo a otro con el teclado ya abierto no dispara ningún
    // evento de teclado, así que este es el único momento para reacomodar.
    setTimeout(acomodar, 60);
  }

  function alDesplazar(e: NativeSyntheticEvent<NativeScrollEvent>) {
    desplazamiento.current = e.nativeEvent.contentOffset.y;
  }

  return (
    <ContextoFormulario.Provider value={valor}>
      <KeyboardAvoidingView style={[styles.flex, style]} behavior="padding">
        {encabezado}
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={contentContainerStyle}
          keyboardShouldPersistTaps="handled"
          onScroll={alDesplazar}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}>
          <View onTouchStart={alEnfocarAlgo}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ContextoFormulario.Provider>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
