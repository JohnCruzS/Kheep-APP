import { memo, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { FlatList, KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TituloPosicionado } from '@/components/ui/BrandLogo';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import type { Comuna } from '@/lib/catalog';
import { PERIMETRO_ALTO, useMarca } from '@/lib/marca';
import { REJILLA, u } from '@/lib/rejilla';
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

  // El título de esta pantalla es el mismo de la app, con sus medidas.
  const marca = useMarca();
  // La barra de botones de Android se dibuja encima: sin esto, "Cerrar"
  // quedaba debajo de ella y no se podía tocar.
  const insets = useSafeAreaInsets();
  const unidad = width / 1000;
  const altoPerimetro = Math.round(PERIMETRO_ALTO * unidad);
  const margen = u(REJILLA.margenLateral);

  const [open, setOpen] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  // Sin comuna elegida dice "Comuna", como el documento EDIT APP: es el
  // hueco donde va el nombre, no una comuna de verdad. Con el permiso de
  // ubicación se llena solo con la detectada, y si no, con la que la persona
  // elija; después queda guardada en el teléfono para las próximas veces.
  const label = comunas.find((c) => c.id === selectedId)?.nombre ?? 'Comuna';

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

      {/* Pantalla completa, no un panel encima del catálogo (documento EDIT
          APP): el mismo título arriba pero con "Chile" debajo —se está
          eligiendo el país entero, no una comuna—, el buscador justo donde
          va el banner, y las comunas centradas. */}
      <Modal visible={open} animationType="fade" onRequestClose={handleClose}>
        <KeyboardAvoidingView style={styles.pantalla} behavior="padding">
          <View style={{ height: altoPerimetro }}>
            <TituloPosicionado
              unidad={unidad}
              altoPerimetro={PERIMETRO_ALTO}
              medidas={{ centroX: marca.centroX, ancho: marca.ancho, alto: marca.alto, centroY: marca.centroY }}
              url={marca.url}
              debajo={<Text style={styles.pais}>Chile</Text>}
            />
          </View>

          <TextInput
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Buscar"
            placeholderTextColor={Colors.textMuted}
            style={[styles.buscador, { marginHorizontal: margen }]}
            autoCorrect={false}
          />

          <FlatList
            data={filas}
            keyExtractor={(item) => item.id ?? 'todas'}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={16}
            maxToRenderPerBatch={16}
            windowSize={10}
            contentContainerStyle={[styles.lista, { paddingBottom: Spacing.four + insets.bottom }]}
            renderItem={({ item }) => (
              <Option label={item.label} active={selectedId === item.id} onPress={() => handleSelect(item.id)} />
            )}
            ListEmptyComponent={<Text style={styles.sinResultados}>No encontramos esa comuna.</Text>}
          />

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
  pantalla: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  pais: {
    fontFamily: Fonts.light,
    fontSize: 18,
    color: '#8A8A8A',
  },
  buscador: {
    fontFamily: Fonts.light,
    textAlign: 'center',
    // Cápsula, como el documento EDIT APP.
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    height: 54,
    fontSize: 18,
    color: Colors.text,
  },
  lista: {
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  option: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  optionLabel: {
    fontFamily: Fonts.light,
    fontSize: 19,
    textAlign: 'center',
    color: Colors.text,
  },
  optionLabelActive: {
    fontFamily: Fonts.medium,
    color: Colors.text,
  },
  sinResultados: {
    fontFamily: Fonts.light,
    paddingVertical: Spacing.four,
    textAlign: 'center',
    color: Colors.textMuted,
    fontSize: 13,
  },
});
