import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';
import { REJILLA, u } from '@/lib/rejilla';
import type { Categoria } from '@/lib/catalog';

type Props = {
  categorias: Categoria[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

/**
 * Alto de la fila (95 de 1000, documento EDIT APP). Se usa también para el
 * hueco que se deja mientras las categorías todavía no llegan, así el
 * catálogo no da un salto cuando la lista llega.
 */
const ALTO_FILA = u(REJILLA.categoriasAlto);

/**
 * Fila de categorías como texto plano (sin fondo de "chip"), en Poppins
 * Light como la plantilla: la seleccionada en rojo, el resto en blanco.
 * Arranca más adentro que las tarjetas (sangría de la plantilla).
 */
function CategoryChipsComponent({ categorias, selectedId, onSelect }: Props) {
  // Mientras se cargan las categorías no se dibuja nada, solo se reserva el
  // alto de la fila. Antes se veía un "Todas" suelto y en rojo durante esos
  // segundos —el único chip que no viene del servidor—, que parecía un error
  // de la app. El hueco evita además que el catálogo dé un salto cuando la
  // lista llega.
  if (categorias.length === 0) {
    return <View style={styles.cargando} />;
  }

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
  cargando: {
    height: ALTO_FILA,
  },
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
    lineHeight: ALTO_FILA,
    color: Colors.text,
  },
  labelActive: {
    fontFamily: Fonts.light,
    color: Colors.accent,
  },
});
