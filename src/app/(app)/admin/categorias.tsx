import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { Button } from '@/components/ui/Button';
import { Colors, Radius, Spacing } from '@/constants/theme';
import {
  CategoriaAdmin,
  actualizarCategoria,
  actualizarCategoriaActiva,
  crearCategoria,
  fetchCategoriasAdmin,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';

/**
 * A diferencia de Comunas, acá el admin sí puede crear categorías nuevas
 * (además de activar/desactivar cada una) — es la diferencia que pidió el
 * cliente entre ambas listas.
 */
export default function CategoriasAdminScreen() {
  const router = useRouter();

  const [categorias, setCategorias] = useState<CategoriaAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CategoriaAdmin | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCategorias(await fetchCategoriasAdmin());
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggle(categoria: CategoriaAdmin) {
    const nuevoValor = !categoria.activa;
    setCategorias((list) => list.map((c) => (c.id === categoria.id ? { ...c, activa: nuevoValor } : c)));
    try {
      await actualizarCategoriaActiva(categoria.id, nuevoValor);
    } catch (err) {
      setCategorias((list) => list.map((c) => (c.id === categoria.id ? { ...c, activa: categoria.activa } : c)));
      setError(getErrorMessage(err, 'No se pudo actualizar la categoría.'));
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backLabel}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.topTitle}>Categorías</Text>
        <Pressable onPress={() => setEditing('new')} hitSlop={12}>
          <Text style={styles.addLabel}>+ Nueva</Text>
        </Pressable>
      </View>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && categorias.length === 0 && (
        <EmptyState title="No hay categorías" message="Crea la primera con “+ Nueva” arriba." />
      )}

      {!loading && !error && categorias.length > 0 && (
        <ScrollView contentContainerStyle={styles.content}>
          {categorias.map((categoria) => (
            <Pressable key={categoria.id} style={styles.row} onPress={() => setEditing(categoria)}>
              <Text style={styles.icono}>{categoria.icono ?? '🏷️'}</Text>
              <Text style={styles.nombre}>{categoria.nombre}</Text>
              <Switch
                value={categoria.activa}
                onValueChange={() => handleToggle(categoria)}
                trackColor={{ false: Colors.surfaceBorder, true: Colors.accent }}
                thumbColor="#FFFFFF"
              />
            </Pressable>
          ))}
        </ScrollView>
      )}

      <CategoriaFormModal
        visible={editing !== null}
        categoria={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
    </SafeAreaView>
  );
}

function CategoriaFormModal({
  visible,
  categoria,
  onClose,
  onSaved,
}: {
  visible: boolean;
  categoria: CategoriaAdmin | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [icono, setIcono] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setNombre(categoria?.nombre ?? '');
      setIcono(categoria?.icono ?? '');
      setError(null);
    }
  }, [visible, categoria]);

  async function handleGuardar() {
    if (nombre.trim().length === 0) {
      setError('Ponle un nombre a la categoría.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const icon = icono.trim().length > 0 ? icono.trim() : null;
      if (categoria) {
        await actualizarCategoria(categoria.id, { nombre: nombre.trim(), icono: icon });
      } else {
        await crearCategoria({ nombre: nombre.trim(), icono: icon });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo guardar la categoría.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.sheetTitle}>{categoria ? 'Editar categoría' : 'Nueva categoría'}</Text>

          <TextInput
            placeholder="Nombre (ej: Comida)"
            placeholderTextColor={Colors.placeholder}
            value={nombre}
            onChangeText={setNombre}
            style={styles.input}
            autoFocus
          />
          <TextInput
            placeholder="Ícono (un emoji, ej: 🍲)"
            placeholderTextColor={Colors.placeholder}
            value={icono}
            onChangeText={setIcono}
            style={styles.input}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button label={saving ? 'Guardando…' : 'Guardar'} onPress={handleGuardar} loading={saving} />
          <Pressable onPress={onClose} style={styles.cancelRow}>
            <Text style={styles.cancelLabel}>Cancelar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  backLabel: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
    width: 70,
  },
  topTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  addLabel: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: '700',
    width: 70,
    textAlign: 'right',
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  icono: {
    fontSize: 20,
  },
  nombre: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '600',
    color: Colors.text,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    padding: Spacing.four,
    paddingBottom: Spacing.six,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.cardText,
    marginBottom: Spacing.three,
  },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.inputBorder,
    paddingVertical: Spacing.two,
    fontSize: 16,
    color: Colors.cardText,
    marginBottom: Spacing.three,
  },
  errorText: {
    fontSize: 13,
    color: Colors.danger,
    marginBottom: Spacing.two,
  },
  cancelRow: {
    marginTop: Spacing.two,
    alignItems: 'center',
  },
  cancelLabel: {
    fontSize: 13,
    color: Colors.cardTextMuted,
    fontWeight: '600',
  },
});
