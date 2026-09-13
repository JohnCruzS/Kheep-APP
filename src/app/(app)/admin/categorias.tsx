import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { Button } from '@/components/ui/Button';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import {
  CATEGORIA_OTRO,
  CategoriaAdmin,
  actualizarCategoria,
  actualizarCategoriaActiva,
  contarPublicacionesDeCategoria,
  crearCategoria,
  eliminarCategoria,
  fetchCategoriasAdmin,
  guardarOrdenCategorias,
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
  const [guardandoOrden, setGuardandoOrden] = useState(false);

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

  // Mientras se guarda un cambio de orden, las flechas quedan bloqueadas:
  // dos guardados cruzados podrían dejar el orden mezclado.
  async function handleMover(index: number, delta: -1 | 1) {
    const destino = index + delta;
    if (guardandoOrden || destino < 0 || destino >= categorias.length) return;
    const anterior = categorias;
    const nueva = [...categorias];
    [nueva[index], nueva[destino]] = [nueva[destino], nueva[index]];
    setCategorias(nueva);
    setGuardandoOrden(true);
    try {
      await guardarOrdenCategorias(nueva.map((c) => c.id));
    } catch (err) {
      setCategorias(anterior);
      setError(getErrorMessage(err, 'No se pudo guardar el orden.'));
    } finally {
      setGuardandoOrden(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
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
          <Text style={styles.ordenHint}>
            Usa ▲ ▼ para definir el orden en que aparecen en la app. Además, cada usuario ve primero las que más usa.
          </Text>
          {categorias.map((categoria, index) => (
            <Pressable key={categoria.id} style={styles.row} onPress={() => setEditing(categoria)}>
              <Text style={styles.icono}>{categoria.icono ?? '🏷️'}</Text>
              <Text style={styles.nombre}>{categoria.nombre}</Text>
              <View style={styles.flechas}>
                <Pressable
                  onPress={() => handleMover(index, -1)}
                  disabled={index === 0 || guardandoOrden}
                  hitSlop={6}
                  accessibilityLabel={`Subir ${categoria.nombre}`}>
                  <Text style={[styles.flecha, (index === 0 || guardandoOrden) && styles.flechaOff]}>▲</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleMover(index, 1)}
                  disabled={index === categorias.length - 1 || guardandoOrden}
                  hitSlop={6}
                  accessibilityLabel={`Bajar ${categoria.nombre}`}>
                  <Text
                    style={[styles.flecha, (index === categorias.length - 1 || guardandoOrden) && styles.flechaOff]}>
                    ▼
                  </Text>
                </Pressable>
              </View>
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

  const esOtro = categoria?.nombre.trim().toLowerCase() === CATEGORIA_OTRO.toLowerCase();

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

  async function handleEliminar() {
    if (!categoria) return;
    let total = 0;
    try {
      total = await contarPublicacionesDeCategoria(categoria.id);
    } catch {
      // Si no se pudo contar, igual se deja confirmar: el aviso es informativo.
    }
    const detalle =
      total === 0
        ? 'No tiene publicaciones.'
        : `${total === 1 ? 'Su publicación pasará' : `Sus ${total} publicaciones pasarán`} a la categoría "${CATEGORIA_OTRO}".`;

    Alert.alert('Eliminar categoría', `¿Eliminar "${categoria.nombre}"? ${detalle}`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          setError(null);
          try {
            await eliminarCategoria(categoria.id);
            onSaved();
            onClose();
          } catch (err) {
            setError(getErrorMessage(err, 'No se pudo eliminar la categoría.'));
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Sube el panel por sobre el teclado: si no, los campos de abajo
            quedan tapados y no se ve lo que se escribe. */}
        <KeyboardAvoidingView behavior="padding">
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

          {categoria && !esOtro ? (
            <Pressable onPress={handleEliminar} disabled={saving} style={styles.deleteRow}>
              <Text style={styles.deleteLabel}>Eliminar categoría</Text>
            </Pressable>
          ) : null}
          {esOtro ? (
            <Text style={styles.otroHint}>
              Esta categoría recibe las publicaciones de las categorías eliminadas, por eso no se puede borrar.
            </Text>
          ) : null}
          <Pressable onPress={onClose} style={styles.cancelRow}>
            <Text style={styles.cancelLabel}>Cancelar</Text>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
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
    fontFamily: Fonts.medium,
    color: Colors.text,
    fontSize: 15,
    width: 70,
  },
  topTitle: {
    fontFamily: Fonts.semiBold,
    color: Colors.text,
    fontSize: 15,
  },
  addLabel: {
    fontFamily: Fonts.semiBold,
    color: Colors.accent,
    fontSize: 14,
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
  ordenHint: {
    fontFamily: Fonts.light,
    fontSize: 12.5,
    lineHeight: 18,
    color: Colors.textMuted,
    marginBottom: Spacing.three,
  },
  flechas: {
    flexDirection: 'row',
    gap: 2,
  },
  flecha: {
    fontFamily: Fonts.regular,
    fontSize: 16,
    color: Colors.text,
    paddingHorizontal: 6,
  },
  flechaOff: {
    color: Colors.surfaceBorder,
  },
  icono: {
    fontFamily: Fonts.light,
    fontSize: 20,
  },
  nombre: {
    fontFamily: Fonts.medium,
    flex: 1,
    fontSize: 14.5,
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
    fontFamily: Fonts.semiBold,
    fontSize: 17,
    color: Colors.cardText,
    marginBottom: Spacing.three,
  },
  input: {
    fontFamily: Fonts.light,
    borderBottomWidth: 1,
    borderBottomColor: Colors.inputBorder,
    paddingVertical: Spacing.two,
    fontSize: 16,
    color: Colors.cardText,
    marginBottom: Spacing.three,
  },
  errorText: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.danger,
    marginBottom: Spacing.two,
  },
  deleteRow: {
    marginTop: Spacing.three,
    alignItems: 'center',
  },
  deleteLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.danger,
  },
  otroHint: {
    fontFamily: Fonts.light,
    marginTop: Spacing.three,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    color: Colors.cardTextMuted,
  },
  cancelRow: {
    marginTop: Spacing.two,
    alignItems: 'center',
  },
  cancelLabel: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: Colors.cardTextMuted,
  },
});
