import { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TituloPosicionado } from '@/components/ui/BrandLogo';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import type { Comuna } from '@/lib/catalog';
import { PERIMETRO_ALTO, useMarca } from '@/lib/marca';
import { REJILLA, u } from '@/lib/rejilla';
import { normalizarTexto } from '@/lib/text';
import { useWindowDimensions } from 'react-native';

/**
 * Elegir una comuna de la lista, con buscador.
 *
 * Es la misma pantalla que usa el catálogo para cambiar de comuna (documento
 * EDIT APP): el título de la app arriba con "Chile" debajo, el buscador a la
 * altura del banner y las comunas centradas. Antes era un panel que subía
 * desde abajo, y elegir comuna se veía distinto según desde dónde se entrara.
 */
export function SelectorComuna({
  visible,
  titulo,
  comunas,
  onElegir,
  onClose,
  conTodas = false,
}: {
  visible: boolean;
  /** Para qué se está eligiendo; va bajo el título. */
  titulo: string;
  comunas: Comuna[];
  /** null = "Todas las comunas", solo si `conTodas` está activo. */
  onElegir: (comunaId: string | null) => void;
  onClose: () => void;
  /** Ofrece "Todas las comunas" arriba del todo. */
  conTodas?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const marca = useMarca();
  const unidad = width / 1000;

  const [busqueda, setBusqueda] = useState('');
  // Sin texto de ayuda mientras se escribe: centrado, en Android empuja el
  // cursor al borde derecho.
  const [escribiendo, setEscribiendo] = useState(false);

  const filas = useMemo(() => {
    const termino = normalizarTexto(busqueda);
    const filtradas = termino ? comunas.filter((c) => normalizarTexto(c.nombre).includes(termino)) : comunas;
    const lista: { id: string | null; label: string }[] = filtradas.map((c) => ({ id: c.id, label: c.nombre }));
    // "Todas" solo cuando no se está buscando algo puntual.
    return conTodas && !termino ? [{ id: null, label: 'Todas las comunas' }, ...lista] : lista;
  }, [comunas, busqueda, conTodas]);

  function cerrar() {
    setBusqueda('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={cerrar}>
      <SafeAreaView style={styles.pantalla} edges={['top']}>
        <KeyboardAvoidingView style={styles.pantalla} behavior="padding">
          <View style={{ height: Math.round(PERIMETRO_ALTO * unidad) }}>
            <TituloPosicionado
              unidad={unidad}
              altoPerimetro={PERIMETRO_ALTO}
              medidas={{ centroX: marca.centroX, ancho: marca.ancho, alto: marca.alto, centroY: marca.centroY }}
              url={marca.url}
              debajo={<Text style={styles.subtitulo}>{titulo}</Text>}
            />
          </View>

          <TextInput
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder={escribiendo ? undefined : 'Buscar'}
            onFocus={() => setEscribiendo(true)}
            onBlur={() => setEscribiendo(false)}
            placeholderTextColor={Colors.textMuted}
            style={[styles.buscador, { marginHorizontal: u(REJILLA.margenLateral) }]}
            autoCorrect={false}
          />

          <FlatList
            data={filas}
            keyExtractor={(item) => item.id ?? 'todas'}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.lista, { paddingBottom: Spacing.four + insets.bottom }]}
            ListEmptyComponent={<Text style={styles.vacio}>No encontramos esa comuna.</Text>}
            renderItem={({ item }) => (
              <Pressable
                style={styles.fila}
                onPress={() => {
                  setBusqueda('');
                  onElegir(item.id);
                }}>
                <Text style={styles.filaLabel}>{item.label}</Text>
              </Pressable>
            )}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  subtitulo: {
    fontFamily: Fonts.light,
    fontSize: 16,
    color: '#8A8A8A',
    textAlign: 'center',
  },
  buscador: {
    fontFamily: Fonts.light,
    textAlign: 'center',
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
  fila: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  filaLabel: {
    fontFamily: Fonts.light,
    fontSize: 19,
    textAlign: 'center',
    color: Colors.text,
  },
  vacio: {
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.five,
  },
});
