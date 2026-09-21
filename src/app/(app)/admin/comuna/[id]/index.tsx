import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { ListaArrastrable } from '@/components/ui/ListaArrastrable';
import { EditorCategoria } from '@/components/admin/EditorCategoria';
import { MenuAcciones } from '@/components/admin/MenuAcciones';
import { SelectorComuna } from '@/components/admin/SelectorComuna';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import {
  CategoriaDeComuna,
  Comuna,
  actualizarVisibilidadCategoriaComuna,
  agregarCategoriaATodasLasComunas,
  eliminarCategoria,
  fetchComunas,
  fetchConfigCategoriasComuna,
  guardarOrdenCategoriasComuna,
  moverCategoriaDeComuna,
  quitarCategoriaDeComuna,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { REJILLA, u } from '@/lib/rejilla';

/** Alto de cada fila, separación incluida: lo necesita el arrastre para saber a qué posición corresponde cada píxel. */
const ALTO_FILA = 62;

/**
 * El catálogo de UNA comuna: qué categorías muestra, en qué orden y con qué
 * acciones. Cada comuna es independiente — lo que se cambia acá no toca a las
 * demás (ver migración 0017).
 *
 * El orden se cambia arrastrando por el asa de la izquierda. Tocar el nombre
 * entra a los perfiles que publican en esa categoría, y el botón de la derecha
 * abre el resto de acciones: editar, ocultar, mover, agregar a todas y
 * eliminar.
 */
export default function CategoriasDeComunaScreen() {
  const router = useRouter();
  const { id: comunaId } = useLocalSearchParams<{ id: string }>();

  const [nombreComuna, setNombreComuna] = useState('');
  const [comunas, setComunas] = useState<Comuna[]>([]);
  const [categorias, setCategorias] = useState<CategoriaDeComuna[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editando, setEditando] = useState<CategoriaDeComuna | null>(null);
  const [creando, setCreando] = useState(false);
  const [moviendo, setMoviendo] = useState<CategoriaDeComuna | null>(null);
  const [acciones, setAcciones] = useState<CategoriaDeComuna | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [config, lista] = await Promise.all([fetchConfigCategoriasComuna(comunaId), fetchComunas()]);
      setCategorias(config.categorias);
      setComunas(lista);
      setNombreComuna(lista.find((c) => c.id === comunaId)?.nombre ?? 'Comuna');
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido.'));
    } finally {
      setLoading(false);
    }
  }, [comunaId]);

  useEffect(() => {
    load();
  }, [load]);

  async function conError(accion: () => Promise<void>, mensaje: string) {
    try {
      await accion();
      await load();
    } catch (err) {
      setError(getErrorMessage(err, mensaje));
    }
  }

  async function handleToggle(categoria: CategoriaDeComuna) {
    const nuevo = !categoria.visible;
    setCategorias((list) => list.map((c) => (c.id === categoria.id ? { ...c, visible: nuevo } : c)));
    try {
      await actualizarVisibilidadCategoriaComuna(comunaId, categoria.id, nuevo);
    } catch (err) {
      setCategorias((list) => list.map((c) => (c.id === categoria.id ? { ...c, visible: categoria.visible } : c)));
      setError(getErrorMessage(err, 'No se pudo actualizar la categoría.'));
    }
  }

  async function handleReordenar(nuevas: CategoriaDeComuna[]) {
    const anterior = categorias;
    setCategorias(nuevas);
    try {
      await guardarOrdenCategoriasComuna(
        comunaId,
        nuevas.map((c) => c.id),
      );
    } catch (err) {
      setCategorias(anterior);
      setError(getErrorMessage(err, 'No se pudo guardar el orden.'));
    }
  }

  /**
   * Eliminar es lo único que no se deshace, así que va en dos pasos: primero
   * de dónde se elimina y después la confirmación, diciendo con todas sus
   * letras qué pasa con las publicaciones.
   */
  /**
   * Eliminar con el alcance ya elegido en el editor ("Comuna/Todo"). Sigue
   * pidiendo confirmación: es lo único que no se deshace.
   */
  function confirmarEliminar(categoria: CategoriaDeComuna, todas: boolean) {
    if (todas) {
      Alert.alert(
        'Eliminar de toda la app',
        `“${categoria.nombre}” se borra del país entero y no queda rastro de ella en ninguna comuna. ` +
          'Todas sus publicaciones, estén donde estén, pasarán a “Otro”. Esto no se puede deshacer.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Eliminar de todas',
            style: 'destructive',
            onPress: () => conError(() => eliminarCategoria(categoria.id), 'No se pudo eliminar la categoría.'),
          },
        ],
      );
      return;
    }

    Alert.alert(
      `Eliminar de ${nombreComuna}`,
      `“${categoria.nombre}” dejará de existir en ${nombreComuna} y las publicaciones que tenga acá pasarán a “Otro”. ` +
        'En las demás comunas sigue igual. Esto no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () =>
            conError(
              () => quitarCategoriaDeComuna(comunaId, categoria.id),
              'No se pudo eliminar la categoría de esta comuna.',
            ),
        },
      ],
    );
  }

  function handleEliminar(categoria: CategoriaDeComuna) {
    Alert.alert(`Eliminar “${categoria.nombre}”`, '¿De dónde quieres eliminarla?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: `Solo de ${nombreComuna}`,
        onPress: () =>
          Alert.alert(
            `Eliminar de ${nombreComuna}`,
            `“${categoria.nombre}” dejará de existir en ${nombreComuna} y las publicaciones que tenga acá pasarán a “Otro”. ` +
              'En las demás comunas sigue igual. Esto no se puede deshacer.',
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Eliminar',
                style: 'destructive',
                onPress: () =>
                  conError(
                    () => quitarCategoriaDeComuna(comunaId, categoria.id),
                    'No se pudo eliminar la categoría de esta comuna.',
                  ),
              },
            ],
          ),
      },
      {
        text: 'De todas las comunas',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            'Eliminar de toda la app',
            `“${categoria.nombre}” se borra del país entero y no queda rastro de ella en ninguna comuna. ` +
              'Todas sus publicaciones, estén donde estén, pasarán a “Otro”. Esto no se puede deshacer.',
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Eliminar de todas',
                style: 'destructive',
                onPress: () => conError(() => eliminarCategoria(categoria.id), 'No se pudo eliminar la categoría.'),
              },
            ],
          ),
      },
    ]);
  }


  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      <EncabezadoMarca subtitulo={nombreComuna} onVolver={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.lista}>
          {loading && <LoadingState />}
          {error && <ErrorState message={error} onRetry={load} />}

          {!loading && !error && categorias.length === 0 && (
            <Text style={styles.vacio}>Esta comuna no muestra ninguna categoría. Agrega una con “Nueva”.</Text>
          )}

          {!loading && !error && (
            <ListaArrastrable
              datos={categorias}
              altoFila={ALTO_FILA}
              claveDe={(categoria) => categoria.id}
              onReordenar={handleReordenar}>
              {(categoria, _indice, arrastrando, propsAsa) => (
                <View style={[styles.fila, arrastrando && styles.filaArrastrando]}>
                  {/* La flecha es el asa: se mantiene apretada y se arrastra
                      para cambiar el orden. Va aparte del resto de la fila
                      para que un deslizamiento normal siga desplazando la
                      pantalla. */}
                  <View {...propsAsa} style={styles.asa} accessibilityLabel={`Mover ${categoria.nombre}`}>
                    <Text style={styles.asaIcono}>➤</Text>
                  </View>

                  <Pressable
                    style={styles.zonaNombre}
                    onPress={() =>
                      router.push({
                        pathname: '/(app)/admin/comuna/[id]/[categoriaId]',
                        params: { id: comunaId, categoriaId: categoria.id },
                      })
                    }
                    // Mantener apretado el nombre abre editar, ocultar, mover,
                    // agregar a todas y eliminar. Antes eso era un botón ⋯ en
                    // la fila, que el documento no tiene.
                    onLongPress={() => setAcciones(categoria)}
                    delayLongPress={300}>
                    <Text style={[styles.nombre, !categoria.visible && styles.nombreOculto]} numberOfLines={1}>
                      {categoria.nombre}
                    </Text>
                  </Pressable>

                  <Switch
                    value={categoria.visible}
                    onValueChange={() => handleToggle(categoria)}
                    trackColor={{ false: Colors.surfaceBorder, true: Colors.accent }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              )}
            </ListaArrastrable>
          )}
        </View>

        <Text style={styles.ayuda}>
          Mantén apretada la flecha para cambiar el orden, y el nombre para editar, mover u ocultar la categoría.
        </Text>
      </ScrollView>

      {/* Fijo abajo, como el documento: no se desplaza con la lista. */}
      <Pressable
        style={({ pressed }) => [styles.nueva, pressed && styles.nuevaPresionada]}
        onPress={() => setCreando(true)}>
        <Text style={styles.nuevaLabel}>Nueva</Text>
      </Pressable>

      {/* Panel propio en vez de un `Alert`: en Android los diálogos solo
          dibujan tres botones y acá hacen falta cinco. */}
      <MenuAcciones
        visible={acciones !== null}
        titulo={acciones?.nombre ?? ''}
        onClose={() => setAcciones(null)}
        acciones={
          acciones
            ? [
                { label: 'Editar nombre', onPress: () => setEditando(acciones) },
                {
                  label: acciones.visible ? 'Ocultar en esta comuna' : 'Mostrar en esta comuna',
                  onPress: () => handleToggle(acciones),
                },
                { label: 'Mover a otra comuna', onPress: () => setMoviendo(acciones) },
                {
                  label: 'Agregar a todas las comunas',
                  onPress: () =>
                    conError(
                      () => agregarCategoriaATodasLasComunas(acciones.id),
                      'No se pudo agregar la categoría a todas las comunas.',
                    ),
                },
                { label: 'Eliminar…', peligrosa: true, onPress: () => handleEliminar(acciones) },
              ]
            : []
        }
      />

      <EditorCategoria
        categoria={editando}
        crear={creando}
        comunaId={comunaId}
        nombreComuna={nombreComuna}
        onClose={() => {
          setEditando(null);
          setCreando(false);
        }}
        onSaved={load}
        onEliminar={(categoria, todas) => {
          setEditando(null);
          confirmarEliminar(categoria, todas);
        }}
      />

      <SelectorComuna
        visible={moviendo !== null}
        titulo={moviendo ? `Mover “${moviendo.nombre}” a…` : ''}
        comunas={comunas.filter((c) => c.id !== comunaId)}
        onClose={() => setMoviendo(null)}
        onElegir={(destino) => {
          const categoria = moviendo;
          setMoviendo(null);
          // Acá siempre se elige una comuna concreta: el selector no ofrece
          // "todas" en este caso (para eso está la acción de agregarla a todas).
          if (categoria && destino) {
            conError(
              () => moverCategoriaDeComuna(categoria.id, comunaId, destino),
              'No se pudo mover la categoría.',
            );
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingBottom: Spacing.six,
  },
  lista: {
    minHeight: 260,
  },
  vacio: {
    fontFamily: Fonts.light,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.four,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Colors.surface,
    borderRadius: u(REJILLA.curvatura),
    paddingHorizontal: Spacing.three,
    height: ALTO_FILA - 8,
  },
  filaArrastrando: {
    backgroundColor: Colors.backgroundAlt,
  },
  asa: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  asaIcono: {
    fontFamily: Fonts.light,
    fontSize: 17,
    color: Colors.textMuted,
  },
  zonaNombre: {
    flex: 1,
    justifyContent: 'center',
  },
  nombre: {
    fontFamily: Fonts.light,
    fontSize: 19,
    color: Colors.text,
  },
  nombreOculto: {
    color: Colors.textMuted,
    opacity: 0.55,
  },
  masBoton: {
    paddingHorizontal: Spacing.two,
  },
  mas: {
    fontFamily: Fonts.medium,
    fontSize: 20,
    color: Colors.textMuted,
  },
  nueva: {
    marginHorizontal: u(REJILLA.margenLateral),
    marginBottom: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: u(REJILLA.curvatura),
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  nuevaPresionada: {
    backgroundColor: Colors.accentPressed,
  },
  nuevaLabel: {
    fontFamily: Fonts.medium,
    fontSize: 21,
    color: '#FFFFFF',
  },
  ayuda: {
    fontFamily: Fonts.light,
    marginTop: Spacing.four,
    fontSize: 12.5,
    lineHeight: 18,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
