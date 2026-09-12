import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import type { Comuna } from '@/lib/catalog';
import { normalizarTexto } from '@/lib/text';

/**
 * Selector de comuna para los formularios (Publicar, Editar publicación,
 * Editar perfil) — se ve igual que `PickerField` (línea inferior, mismo
 * tipo de letra), pero por dentro abre un buscador con lista virtualizada
 * en vez de una fila horizontal de chips: con ~346 comunas, una fila
 * horizontal sin buscador es imposible de usar (y lenta de armar).
 * Categoría sigue usando `PickerField` tal cual — ahí sí son pocas opciones
 * y el chip horizontal se ve y funciona bien.
 */
export function ComunaFieldPicker({
  label,
  comunas,
  selectedId,
  onSelect,
}: {
  label: string;
  comunas: Comuna[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const value = comunas.find((c) => c.id === selectedId)?.nombre ?? '';

  const filtradas = useMemo(() => {
    const termino = normalizarTexto(busqueda);
    return termino ? comunas.filter((c) => normalizarTexto(c.nombre).includes(termino)) : comunas;
  }, [comunas, busqueda]);

  function handleClose() {
    setOpen(false);
    setBusqueda('');
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={() => setOpen(true)} style={styles.row}>
        <Text style={value ? styles.value : styles.placeholder}>{value || label}</Text>
        <Text style={styles.chevron}>﹀</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
        <Pressable style={styles.backdrop} onPress={handleClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{label}</Text>

            <TextInput
              value={busqueda}
              onChangeText={setBusqueda}
              placeholder="Buscar comuna…"
              placeholderTextColor={Colors.placeholder}
              style={styles.buscador}
              autoCorrect={false}
              autoFocus
            />

            <FlatList
              data={filtradas}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={16}
              maxToRenderPerBatch={16}
              windowSize={10}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onSelect(item.id);
                    handleClose();
                  }}
                  style={styles.option}>
                  <Text style={[styles.optionLabel, item.id === selectedId && styles.optionLabelActive]}>
                    {item.nombre}
                  </Text>
                  {item.id === selectedId && <Text style={styles.check}>✓</Text>}
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.sinResultados}>No encontramos esa comuna.</Text>}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.inputBorder,
    paddingBottom: Spacing.two,
  },
  value: {
    fontFamily: Fonts.light,
    fontSize: 16,
    color: Colors.cardText,
  },
  placeholder: {
    fontFamily: Fonts.light,
    fontSize: 16,
    color: Colors.placeholder,
  },
  chevron: {
    fontFamily: Fonts.light,
    color: Colors.textMuted,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    height: '75%',
  },
  sheetTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 17,
    color: Colors.cardText,
    marginBottom: Spacing.three,
  },
  buscador: {
    fontFamily: Fonts.light,
    backgroundColor: '#F1F1F1',
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    height: 44,
    fontSize: 14,
    color: Colors.cardText,
    marginBottom: Spacing.two,
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.inputBorder,
  },
  optionLabel: {
    fontFamily: Fonts.light,
    fontSize: 15,
    color: Colors.cardText,
  },
  optionLabelActive: {
    fontFamily: Fonts.semiBold,
    color: Colors.accent,
  },
  check: {
    fontFamily: Fonts.semiBold,
    color: Colors.accent,
  },
  sinResultados: {
    fontFamily: Fonts.light,
    paddingVertical: Spacing.four,
    textAlign: 'center',
    color: Colors.cardTextMuted,
    fontSize: 13,
  },
});
