import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ANCHO_LOGO_MAX, ANCHO_LOGO_MIN } from '@/lib/marca';
import { Colors, Fonts, Spacing } from '@/constants/theme';

const PASOS = [-5, -1, 1, 5];

/**
 * Ajuste de un valor en porcentaje (tamaño o posición del título) con
 * botones de paso en vez de una barra deslizante, a propósito: un deslizador
 * necesita una dependencia nativa (que obliga a recompilar la app) y además
 * el dedo tapa justo el logo que se está mirando. Con pasos de 5 % se recorre
 * todo el rango rápido y con los de 1 % se afina.
 *
 * `min`/`max` son opcionales y por defecto son los del ANCHO del título
 * (el primer uso de este control), pero el mismo componente sirve para el
 * margen superior pasando su propio rango — son controles idénticos, solo
 * cambia qué número están moviendo y sus topes.
 */
export function ControlTamano({
  valor,
  onChange,
  deshabilitado,
  min = ANCHO_LOGO_MIN,
  max = ANCHO_LOGO_MAX,
}: {
  valor: number;
  onChange: (nuevo: number) => void;
  deshabilitado?: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <View style={[styles.fila, deshabilitado && styles.filaApagada]} pointerEvents={deshabilitado ? 'none' : 'auto'}>
      {PASOS.map((paso) => {
        // Los extremos se apagan en vez de desaparecer: un botón que cambia
        // de lugar según el valor se vuelve imposible de apretar seguido.
        const destino = valor + paso;
        const tope = destino < min || destino > max;
        const etiqueta = paso > 0 ? `+${paso}` : `${paso}`;
        return (
          <Pressable
            key={paso}
            onPress={() => onChange(Math.min(max, Math.max(min, destino)))}
            disabled={tope}
            style={[styles.boton, Math.abs(paso) === 5 && styles.botonGrande, tope && styles.botonApagado]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Cambiar en ${etiqueta} por ciento`}>
            <Text style={styles.botonLabel}>{etiqueta}</Text>
          </Pressable>
        );
      })}
      <Text style={styles.valor}>{valor} %</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  filaApagada: {
    opacity: 0.35,
  },
  boton: {
    minWidth: 44,
    paddingVertical: 8,
    paddingHorizontal: Spacing.two,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  botonGrande: {
    backgroundColor: Colors.background,
  },
  botonApagado: {
    opacity: 0.3,
  },
  botonLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.text,
  },
  valor: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: Colors.text,
    minWidth: 52,
    textAlign: 'right',
  },
});
