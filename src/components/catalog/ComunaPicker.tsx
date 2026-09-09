import { memo, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import type { Comuna } from '@/lib/catalog';
import { normalizarTexto } from '@/lib/text';

type Props = {
  comunas: Comuna[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

type Fila = { id: string | null; label: string };

/**
 * "Filtro Geográfico Hiperlocal" del plan: selector de comuna en la barra
 * superior que adapta la vitrina al instante. Con las ~346 comunas del país
 * (antes eran solo 5, de prueba) esto necesita buscador y una lista
 * virtualizada — mostrarlas todas de una en un View sin buscador se sentía
 * lento para abrir y ni siquiera se podía hacer scroll.
 */
function ComunaPickerComponent({ comunas, selectedId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const label = comunas.find((c) => c.id === selectedId)?.nombre ?? 'Todas las comunas';

  const filas = useMemo<Fila[]>(() => {
    const termino = normalizarTexto(busqueda);
    const comunasFiltradas = termino
      ? comunas.filter((c) => normalizarTexto(c.nombre).includes(termino))
      : comunas;

    const lista: Fila[] = comunasFiltradas.map((c) => ({ id: c.id, label: c.nombre }));
    // "Todas las comunas" solo tiene sentido cuando no se está buscando algo
    // puntual.
    return termino ? lista : [{ id: null, label: 'Todas las comunas' }, ...lista];
  }, [comunas, busqueda]);

  function handleClose() {
    setOpen(false);
    setBusqueda('');
  }

  function handleSelect(id: string | null) {
    onSelect(id);
    handleClose();
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={8} style={styles.trigger}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.chevron}>﹀</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
        <Pressable style={styles.backdrop} onPress={handleClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Elige tu comuna</Text>

            <TextInput
              value={busqueda}
              onChangeText={setBusqueda}
              placeholder="Buscar comuna…"
              placeholderTextColor={Colors.textMuted}
              style={styles.buscador}
              autoCorrect={false}
            />

            <FlatList
              data={filas}
              keyExtractor={(item) => item.id ?? 'todas'}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={16}
              maxToRenderPerBatch={16}
              windowSize={10}
              renderItem={({ item }) => (
                <Option
                  label={item.label}
                  active={selectedId === item.id}
                  onPress={() => handleSelect(item.id)}
                />
              )}
              ListEmptyComponent={<Text style={styles.sinResultados}>No encontramos esa comuna.</Text>}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export const ComunaPicker = memo(ComunaPickerComponent);

function Option({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.option}>
      <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{label}</Text>
      {active && <Text style={styles.check}>✓</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  label: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: '#B5B5B5',
  },
  chevron: {
    fontSize: 12,
    color: '#B5B5B5',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.backgroundAlt,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    // Alto acotado: sin esto, un FlatList con 300+ filas simplemente se
    // sale de la pantalla y no queda espacio donde hacer scroll.
    height: '75%',
  },
  sheetTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: Colors.textMuted,
    marginBottom: Spacing.three,
  },
  buscador: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    height: 44,
    fontSize: 14,
    color: Colors.text,
    marginBottom: Spacing.two,
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  optionLabel: {
    fontSize: 15,
    color: Colors.text,
  },
  optionLabelActive: {
    color: Colors.accent,
    fontWeight: '700',
  },
  check: {
    color: Colors.accent,
    fontWeight: '700',
  },
  sinResultados: {
    paddingVertical: Spacing.four,
    textAlign: 'center',
    color: Colors.textMuted,
    fontSize: 13,
  },
});
