import { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import type { Comuna } from '@/lib/catalog';
import { normalizarTexto } from '@/lib/text';

/**
 * Elegir una comuna de la lista, con buscador. Se usa para mover una categoría
 * de una comuna a otra; con las ~346 comunas del país, sin buscador habría que
 * desplazarse a ciegas.
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
  titulo: string;
  comunas: Comuna[];
  /** null = "Todas las comunas", solo si `conTodas` está activo. */
  onElegir: (comunaId: string | null) => void;
  onClose: () => void;
  /** Ofrece "Todas las comunas" arriba del todo. */
  conTodas?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [busqueda, setBusqueda] = useState('');

  const filtradas = useMemo(() => {
    const termino = normalizarTexto(busqueda);
    if (!termino) return comunas;
    return comunas.filter((c) => normalizarTexto(c.nombre).includes(termino));
  }, [comunas, busqueda]);

  function cerrar() {
    setBusqueda('');
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cerrar}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <Pressable style={styles.backdrop} onPress={cerrar}>
          {/* El relleno de abajo reserva la franja del sistema (los tres
              botones o la barra de gestos): sin ella, "Cancelar" quedaba
              justo debajo y no se podía tocar. */}
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom }]}
            onPress={(e) => e.stopPropagation()}>
            <Text style={styles.titulo} numberOfLines={2}>
              {titulo}
            </Text>

            <TextInput
              value={busqueda}
              onChangeText={setBusqueda}
              placeholder="Buscar comuna…"
              placeholderTextColor={Colors.textMuted}
              style={styles.buscador}
              autoCorrect={false}
            />

            {/* "Todas" va fija encima de la lista y no dentro de ella: como
                primera fila de la lista se perdía al desplazarse entre las 346
                comunas, y es justo la opción que el admin busca. */}
            {conTodas && (
              <Pressable
                style={({ pressed }) => [styles.todas, pressed && styles.todasPresionada]}
                onPress={() => {
                  setBusqueda('');
                  onElegir(null);
                }}>
                <Text style={styles.todasLabel}>Todas las comunas</Text>
              </Pressable>
            )}

            <FlatList
              data={filtradas}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.vacio}>No encontramos esa comuna.</Text>}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.fila}
                  onPress={() => {
                    setBusqueda('');
                    onElegir(item.id);
                  }}>
                  <Text style={styles.nombre}>{item.nombre}</Text>
                </Pressable>
              )}
            />

            <Pressable onPress={cerrar} style={styles.cancelar}>
              <Text style={styles.cancelarLabel}>Cancelar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
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
    // Acotado: con cientos de comunas, sin tope la lista se sale de pantalla
    // y no queda dónde desplazarse.
    height: '75%',
  },
  titulo: {
    fontFamily: Fonts.light,
    fontSize: 19,
    color: Colors.accent,
    marginBottom: Spacing.three,
  },
  buscador: {
    fontFamily: Fonts.light,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 15,
    color: Colors.text,
    marginBottom: Spacing.two,
  },
  fila: {
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  nombre: {
    fontFamily: Fonts.light,
    fontSize: 17,
    color: Colors.text,
  },
  todas: {
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  todasPresionada: {
    backgroundColor: Colors.surface,
  },
  todasLabel: {
    fontFamily: Fonts.light,
    fontSize: 17,
    color: Colors.accent,
  },
  vacio: {
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  cancelar: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  cancelarLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.textMuted,
  },
});
