import { Pressable, StyleSheet, View } from 'react-native';

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
  return (
    <View style={styles.fila} accessibilityRole="tablist">
      {opciones.map((opcion) => {
        const activa = opcion.id === elegida;
        return (
          <Pressable
            key={opcion.id}
            onPress={() => onElegir(opcion.id)}
            hitSlop={8}
            accessibilityRole="tab"
            accessibilityState={{ selected: activa }}>
            <Text style={[styles.label, activa && styles.labelActiva]}>{opcion.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.four,
    paddingVertical: Spacing.three,
  },
  label: {
    fontFamily: Fonts.delgada,
    fontSize: 19,
    color: Colors.text,
  },
  labelActiva: {
    color: Colors.accent,
  },
});
