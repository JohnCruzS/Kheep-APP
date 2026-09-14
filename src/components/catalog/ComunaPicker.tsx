import { memo, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { FlatList, KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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
  // El nombre escala con el ancho de la pantalla, en la misma rejilla que el
  // título (45 de 1000), para que el bloque completo se vea igual de
  // proporcionado en un teléfono chico y en una tablet. Los topes evitan los
  // dos extremos: ilegible en pantallas muy angostas, enorme en muy anchas.
  const { width } = useWindowDimensions();
  const tamanoNombre = Math.min(26, Math.max(14, Math.round((width * 45) / 1000)));

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
        {/* Una sola línea: partido en dos, el nombre se metía en el banner.
            Si no cabe entero se recorta con puntos suspensivos, que es más
            limpio que empujar el resto del catálogo hacia abajo. */}
        <Text style={[styles.label, { fontSize: tamanoNombre, lineHeight: Math.round(tamanoNombre * 1.3) }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
        {/* El panel se ancla abajo, justo donde aparece el teclado. Con
            `padding` el contenedor se encoge al alto libre y, como el panel
            mide un porcentaje de ese contenedor, queda completo sobre el
            teclado en vez de quedar tapado. */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
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
        </KeyboardAvoidingView>
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
  // Como en la plantilla: solo el nombre de la comuna bajo el logo, sin
  // flecha. Sigue siendo tocable (abre el buscador de comunas).
  trigger: {
    alignItems: 'center',
    // El nombre puede ser más ancho que el título (p. ej. "Todas las
    // comunas"), pero no más que el contenido del catálogo.
    maxWidth: '85%',
  },
  label: {
    fontFamily: Fonts.light,
    fontSize: 18,
    lineHeight: 24,
    color: '#8A8A8A',
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
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    letterSpacing: 0.4,
    color: Colors.textMuted,
    marginBottom: Spacing.three,
  },
  buscador: {
    fontFamily: Fonts.light,
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
    fontFamily: Fonts.light,
    fontSize: 15,
    color: Colors.text,
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
    color: Colors.textMuted,
    fontSize: 13,
  },
});
