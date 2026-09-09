import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Colors, Fonts, Spacing } from '@/constants/theme';
import type { Categoria } from '@/lib/catalog';

type Props = {
  categorias: Categoria[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

/**
 * Fila de categorías como texto plano (sin fondo de "chip") — la
 * seleccionada se resalta en rojo, tal como el mockup ("Delivery" en rojo,
 * el resto en blanco/gris).
 */
function CategoryChipsComponent({ categorias, selectedId, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}>
      <Tab label="Todas" active={selectedId === null} onPress={() => onSelect(null)} />
      {categorias.map((categoria) => (
        <Tab
          key={categoria.id}
          label={categoria.nombre}
          active={selectedId === categoria.id}
          onPress={() => onSelect(categoria.id)}
        />
      ))}
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
    gap: Spacing.four + 4,
    paddingHorizontal: 2,
    paddingBottom: Spacing.four,
    paddingTop: Spacing.two,
    alignItems: 'center',
  },
  label: {
    fontFamily: Fonts.semiBold,
    fontSize: 22,
    color: '#E8E8E8',
  },
  labelActive: {
    color: Colors.accent,
  },
});
