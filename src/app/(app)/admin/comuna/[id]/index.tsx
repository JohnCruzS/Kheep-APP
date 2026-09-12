import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { Button } from '@/components/ui/Button';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import {
  CategoriaAdmin,
  CategoriaDeComuna,
  actualizarVisibilidadCategoriaComuna,
  agregarCategoriaAComuna,
  crearCategoriaEnComuna,
  fetchCategoriasAdmin,
  fetchComunas,
  fetchConfigCategoriasComuna,
  guardarOrdenCategoriasComuna,
  quitarCategoriaDeComuna,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';

/**
 * El catálogo de UNA comuna: qué categorías muestra, en qué orden, cuáles
 * están ocultas y cuáles se quitaron. Cada comuna es independiente — lo que
 * se cambia acá no toca a las demás (ver migración 0017).
 *
 * Ocultar y quitar son cosas distintas a propósito: ocultar la saca del
 * catálogo pero la deja acá para volver a encenderla con un toque; quitarla
 * la borra de esta comuna y sus publicaciones de acá pasan a "Otro".
 */
export default function CategoriasDeComunaScreen() {
  const router = useRouter();
  const { id: comunaId } = useLocalSearchParams<{ id: string }>();

  const [nombreComuna, setNombreComuna] = useState('');
  const [categorias, setCategorias] = useState<CategoriaDeComuna[]>([]);
  const [personalizada, setPersonalizada] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [config, comunas] = await Promise.all([fetchConfigCategoriasComuna(comunaId), fetchComunas()]);
      setCategorias(config.categorias);
      setPersonalizada(config.personalizada);
      setNombreComuna(comunas.find((c) => c.id === comunaId)?.nombre ?? 'Comuna');
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido.'));
    } finally {
      setLoading(false);
    }
  }, [comunaId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggle(categoria: CategoriaDeComuna) {
    const nuevo = !categoria.visible;
    setCategorias((list) => list.map((c) => (c.id === categoria.id ? { ...c, visible: nuevo } : c)));
    try {
      await actualizarVisibilidadCategoriaComuna(comunaId, categoria.id, nuevo);
      // La primera vez que se toca algo, la comuna deja de seguir a la lista
      // global: hay que recargar para reflejar que ya es independiente.
      if (!personalizada) load();
    } catch (err) {
      setCategorias((list) => list.map((c) => (c.id === categoria.id ? { ...c, visible: categoria.visible } : c)));
      setError(getErrorMessage(err, 'No se pudo actualizar la categoría.'));
    }
  }

  function handleQuitar(categoria: CategoriaDeComuna) {
    Alert.alert(
      'Quitar de esta comuna',
      `“${categoria.nombre}” dejará de existir en ${nombreComuna} y sus publicaciones de esta comuna pasarán a “Otro”. ` +
        'En las demás comunas sigue igual. Si solo quieres que no se vea por un tiempo, usa el interruptor.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: async () => {
            try {
              await quitarCategoriaDeComuna(comunaId, categoria.id);
              load();
            } catch (err) {
              setError(getErrorMessage(err, 'No se pudo quitar la categoría.'));
            }
          },
        },
      ],
    );
  }

  async function handleMover(indice: number, direccion: -1 | 1) {
    const destino = indice + direccion;
    if (destino < 0 || destino >= categorias.length) return;

    const reordenadas = [...categorias];
    [reordenadas[indice], reordenadas[destino]] = [reordenadas[destino], reordenadas[indice]];
    setCategorias(reordenadas);
    try {
      await guardarOrdenCategoriasComuna(
        comunaId,
        reordenadas.map((c) => c.id),
      );
      if (!personalizada) load();
    } catch (err) {
      setCategorias(categorias);
      setError(getErrorMessage(err, 'No se pudo guardar el orden.'));
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backLabel}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {nombreComuna}
        </Text>
        <Pressable onPress={() => setAgregando(true)} hitSlop={12}>
          <Text style={styles.addLabel}>+ Agregar</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.ayuda}>
          {personalizada
            ? `Esta comuna tiene su propio catálogo. El interruptor muestra u oculta la categoría solo acá; “Quitar” la saca de ${nombreComuna}. Toca el nombre para ver los perfiles que publican en ella.`
            : `${nombreComuna} todavía muestra el catálogo general. Apenas cambies algo acá, pasa a tener el suyo propio y deja de seguir al general.`}
        </Text>

        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && categorias.length === 0 && (
          <Text style={styles.vacio}>
            Esta comuna no muestra ninguna categoría. Agrega una con “+ Agregar” para que su catálogo tenga contenido.
          </Text>
        )}

        {categorias.map((categoria, indice) => (
          <View key={categoria.id} style={styles.row}>
            <Text style={styles.icono}>{categoria.icono ?? '🏷️'}</Text>

            <Pressable
              style={styles.rowInfo}
              onPress={() =>
                router.push({
                  pathname: '/(app)/admin/comuna/[id]/[categoriaId]',
                  params: { id: comunaId, categoriaId: categoria.id },
                })
              }>
              <Text style={styles.nombre} numberOfLines={1}>
                {categoria.nombre}
              </Text>
              <Text style={styles.subtexto}>{categoria.visible ? 'Se muestra' : 'Oculta'} · ver perfiles ›</Text>
            </Pressable>

            <View style={styles.ordenBotones}>
              <Pressable onPress={() => handleMover(indice, -1)} hitSlop={6} style={styles.ordenBoton}>
                <Text style={styles.ordenLabel}>▲</Text>
              </Pressable>
              <Pressable onPress={() => handleMover(indice, 1)} hitSlop={6} style={styles.ordenBoton}>
                <Text style={styles.ordenLabel}>▼</Text>
              </Pressable>
            </View>

            <View style={styles.rowActions}>
              <Switch
                value={categoria.visible}
                onValueChange={() => handleToggle(categoria)}
                trackColor={{ false: Colors.surfaceBorder, true: Colors.accent }}
                thumbColor="#FFFFFF"
              />
              <Pressable onPress={() => handleQuitar(categoria)} hitSlop={8}>
                <Text style={styles.quitar}>Quitar</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>

      <AgregarCategoriaModal
        visible={agregando}
        comunaId={comunaId}
        nombreComuna={nombreComuna}
        yaPresentes={categorias.map((c) => c.id)}
        onClose={() => setAgregando(false)}
        onSaved={load}
      />
    </SafeAreaView>
  );
}

/**
 * Agregar una categoría a esta comuna: o una que ya existe en la app, o una
 * nueva que nace existiendo solo acá (las demás comunas no la ven hasta que
 * el admin se la agregue).
 */
function AgregarCategoriaModal({
  visible,
  comunaId,
  nombreComuna,
  yaPresentes,
  onClose,
  onSaved,
}: {
  visible: boolean;
  comunaId: string;
  nombreComuna: string;
  yaPresentes: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [disponibles, setDisponibles] = useState<CategoriaAdmin[]>([]);
  const [nombre, setNombre] = useState('');
  const [icono, setIcono] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setNombre('');
    setIcono('');
    setError(null);
    fetchCategoriasAdmin()
      .then((todas) => setDisponibles(todas.filter((c) => !yaPresentes.includes(c.id))))
      .catch(() => setDisponibles([]));
  }, [visible, yaPresentes]);

  async function conGuardado(accion: () => Promise<void>) {
    setSaving(true);
    setError(null);
    try {
      await accion();
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo agregar la categoría.'));
    } finally {
      setSaving(false);
    }
  }

  function handleCrear() {
    if (nombre.trim().length === 0) return setError('Ponle un nombre a la categoría.');
    conGuardado(() =>
      crearCategoriaEnComuna(comunaId, { nombre: nombre.trim(), icono: icono.trim() || null }),
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior="padding">
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Agregar a {nombreComuna}</Text>

            <Text style={styles.sheetSeccion}>NUEVA, SOLO PARA ESTA COMUNA</Text>
            <View style={styles.nuevaFila}>
              <TextInput
                placeholder="Emoji"
                placeholderTextColor={Colors.placeholder}
                value={icono}
                onChangeText={setIcono}
                style={[styles.input, styles.inputIcono]}
                maxLength={4}
              />
              <TextInput
                placeholder="Nombre (ej: Pesca)"
                placeholderTextColor={Colors.placeholder}
                value={nombre}
                onChangeText={setNombre}
                style={[styles.input, styles.inputNombre]}
              />
            </View>
            <Button label={saving ? 'Guardando…' : 'Crear y agregar'} onPress={handleCrear} loading={saving} />

            {disponibles.length > 0 && (
              <>
                <Text style={[styles.sheetSeccion, { marginTop: Spacing.four }]}>O UNA QUE YA EXISTE</Text>
                <ScrollView style={styles.listaExistentes} keyboardShouldPersistTaps="handled">
                  {disponibles.map((categoria) => (
                    <Pressable
                      key={categoria.id}
                      style={styles.existenteFila}
                      onPress={() => conGuardado(() => agregarCategoriaAComuna(comunaId, categoria.id))}>
                      <Text style={styles.existenteLabel}>
                        {categoria.icono ?? '🏷️'}  {categoria.nombre}
                      </Text>
                      <Text style={styles.existenteAgregar}>Agregar</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

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
    width: 78,
  },
  topTitle: {
    fontFamily: Fonts.semiBold,
    color: Colors.text,
    fontSize: 15,
    flex: 1,
    textAlign: 'center',
  },
  addLabel: {
    fontFamily: Fonts.semiBold,
    color: Colors.accent,
    fontSize: 14,
    width: 78,
    textAlign: 'right',
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
  },
  ayuda: {
    fontFamily: Fonts.light,
    marginBottom: Spacing.three,
    fontSize: 12.5,
    lineHeight: 18,
    color: Colors.textMuted,
  },
  vacio: {
    fontFamily: Fonts.light,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
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
  rowInfo: {
    flex: 1,
  },
  nombre: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.text,
  },
  subtexto: {
    fontFamily: Fonts.light,
    fontSize: 11.5,
    color: Colors.textMuted,
    marginTop: 2,
  },
  ordenBotones: {
    gap: 2,
  },
  ordenBoton: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ordenLabel: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: Colors.textMuted,
  },
  rowActions: {
    alignItems: 'center',
    gap: 4,
  },
  quitar: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: Colors.danger,
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
  sheetSeccion: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    letterSpacing: 0.6,
    color: Colors.cardTextMuted,
    marginBottom: Spacing.two,
  },
  nuevaFila: {
    flexDirection: 'row',
    gap: Spacing.three,
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
  inputIcono: {
    width: 70,
    textAlign: 'center',
  },
  inputNombre: {
    flex: 1,
  },
  listaExistentes: {
    maxHeight: 210,
  },
  existenteFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.inputBorder,
  },
  existenteLabel: {
    fontFamily: Fonts.light,
    fontSize: 15,
    color: Colors.cardText,
  },
  existenteAgregar: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: Colors.accent,
  },
  errorText: {
    fontFamily: Fonts.light,
    marginTop: Spacing.three,
    fontSize: 13,
    color: Colors.danger,
  },
  cancelRow: {
    alignItems: 'center',
    paddingTop: Spacing.three,
  },
  cancelLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.cardTextMuted,
  },
});
