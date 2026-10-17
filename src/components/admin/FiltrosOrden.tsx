import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing } from '@/constants/theme';

/**
 * Fila de filtros de las listas del panel ("Recientes · Antiguos ·
 * Pendientes"), con el mismo estilo de las categorías del inicio: texto
 * plano, la opción elegida en rojo y el resto en blanco.
 */
export function FiltrosOrden<T extends string>({
  opciones,
  elegida,
  onElegir,
}: {
  opciones: { id: T; label: string }[];
  elegida: T;
  onElegir: (id: T) => void;
}) {
  // Con más de tres (la lista de una categoría tiene cinco) la letra baja un
  // poco y se reparten a todo el ancho, para que se vean todos de una vez.
  const compacta = opciones.length > 3;
  return (
    // En una sola línea: si aun así no caben, se desliza de lado.
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Sin esto, la ScrollView se estira a lo alto y empuja todo hacia abajo.
      style={styles.contenedor}
      contentContainerStyle={[styles.fila, compacta && styles.filaCompacta]}
      accessibilityRole="tablist">
      {opciones.map((opcion) => {
        const activa = opcion.id === elegida;
        return (
          <Pressable
            key={opcion.id}
            onPress={() => onElegir(opcion.id)}
            hitSlop={8}
            accessibilityRole="tab"
            accessibilityState={{ selected: activa }}>
            <Text style={[styles.label, compacta && styles.labelCompacta, activa && styles.labelActiva]}>{opcion.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flexGrow: 0,
  },
  fila: {
    flexDirection: 'row',
    gap: Spacing.four,
    paddingVertical: Spacing.three,
  },
  filaCompacta: {
    flexGrow: 1,
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  label: {
    fontFamily: Fonts.delgada,
    fontSize: 19,
    color: Colors.text,
  },
  labelCompacta: {
    fontSize: 15,
  },
  labelActiva: {
    color: Colors.accent,
  },
});
