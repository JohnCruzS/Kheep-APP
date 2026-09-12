import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';
import type { Categoria } from '@/lib/catalog';

type Props = {
  categorias: Categoria[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

/**
 * Fila de categorías como texto plano (sin fondo de "chip"), en Poppins
 * Light como la plantilla: la seleccionada en rojo, el resto en blanco.
 * Arranca más adentro que las tarjetas (sangría de la plantilla).
 */
function CategoryChipsComponent({ categorias, selectedId, onSelect }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
      {categorias.map((categoria) => (
        <Tab
          key={categoria.id}
          label={categoria.nombre}
          active={selectedId === categoria.id}
          onPress={() => onSelect(categoria.id)}
        />
      ))}
      {/* "Todas" va al final de la fila, no al principio (pedido del cliente). */}
      <Tab label="Todas" active={selectedId === null} onPress={() => onSelect(null)} />
    </ScrollView>
  );
}

export const CategoryChips = memo(CategoryChipsComponent);

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 24,
    // Sin sangría propia: el contenedor del catálogo ya aplica el margen
    // lateral de la rejilla (30 de 400), y las categorías deben alinearse
    // con el borde del banner y de las tarjetas.
    paddingHorizontal: 0,
    alignItems: 'center',
  },
  label: {
    fontFamily: Fonts.light,
    fontSize: 21,
    lineHeight: 30,
    color: Colors.text,
  },
  labelActive: {
    fontFamily: Fonts.light,
    color: Colors.accent,
  },
});
