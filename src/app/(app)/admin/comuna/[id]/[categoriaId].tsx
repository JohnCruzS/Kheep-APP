import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Texto';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { comunasEnMemoria } from '@/lib/cacheAdmin';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Interruptor } from '@/components/ui/Interruptor';
import { AccionRoja, FilaDato, FilaInterruptor, TarjetaDesplegable } from '@/components/admin/TarjetaDesplegable';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { puede } from '@/lib/administradores';
import {
  PerfilEnCategoria,
  actualizarNivelPerfil,
  actualizarPuedeEditar,
  actualizarVisibilidadPerfil,
  contarPublicacionesDeUsuarios,
  fetchCorreoDeCuenta,
  reactivarCuenta,
  suspenderCuenta,
  eliminarPerfil,
  eliminarPublicacionesDePerfil,
  fetchCategoriasAdmin,
  fetchComuna,
  fetchPerfilesDeCategoria,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { useSession } from '@/providers/SessionProvider';
import { REJILLA, u } from '@/lib/rejilla';
import { FiltrosOrden } from '@/components/admin/FiltrosOrden';

/**
 * Los perfiles que publican en una categoría dentro de una comuna, en
 * tarjetas que se abren y se cierran (maqueta del cliente). Abierta, cada una
 * muestra:
 *  - junto al nombre, cuántas publicaciones tiene ("(5)"): al tocarlo se ven
 *    todas, en tarjetas como las del inicio;
 *  - a la derecha, el interruptor de visible/oculto;
 *  - su correo y tres permisos: Directo (publica sin pasar por Aprobar),
 *    Loguin (puede entrar a su cuenta; apagado = suspendida) y Editar (puede
 *    cambiar sus publicaciones);
 *  - "Eliminar". Tocar el correo abre su ficha completa.
 *
 * Ocultar y eliminar son cosas distintas:
 *  - Ocultar: el perfil y sus publicaciones desaparecen del catálogo, pero la
 *    cuenta queda intacta y se vuelve a mostrar con un toque. Es lo que se usa
 *    para un problema temporal.
 *  - Eliminar publicaciones: borra lo que publicó, la cuenta sigue viva y
 *    puede volver a publicar.
 *  - Eliminar perfil: borra la cuenta completa con todo lo suyo. No se
 *    deshace.
 */
export default function PerfilesDeCategoriaScreen() {
  const router = useRouter();
  const { id: comunaId, categoriaId } = useLocalSearchParams<{ id: string; categoriaId: string }>();
  const { permisos } = useSession();
  const esGeneral = permisos?.esGeneral ?? false;
  /** Suspender (Loguin) también lo puede un administrador de zona con ese permiso. */
  const puedeSuspender = esGeneral || puede(permisos, 'suspender', comunaId);
  const [abierto, setAbierto] = useState<string | null>(null);
  /** Publicaciones de cada usuario en todas las comunas: el "(5)". */
  const [totales, setTotales] = useState<Record<string, number>>({});
  /** Correos ya pedidos (se piden al abrir la tarjeta: viven fuera de la API). */
  const [correos, setCorreos] = useState<Record<string, string | null>>({});

  const [perfiles, setPerfiles] = useState<PerfilEnCategoria[]>([]);
  // Igual que en la lista de categorías: el nombre al instante desde la
  // memoria y la comuna buscada directo, aunque esté oculta.
  const [comunaNombre, setComunaNombre] = useState(
    () => comunasEnMemoria()?.find((c) => c.id === comunaId)?.nombre ?? '',
  );
  const [tituloCategoria, setTituloCategoria] = useState('Categoría');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * Cómo se ve la lista (pedido del cliente): por fecha de registro de la
   * cuenta, de la más antigua a la más reciente o al revés, o solo los que
   * tienen algo esperando aprobación (de los más antiguos a los recientes).
   */
  const [filtro, setFiltro] = useState<'antiguos' | 'recientes' | 'pendientes'>('antiguos');
  const visibles = useMemo(() => {
    const porFecha = [...perfiles].sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (filtro === 'recientes') return porFecha.reverse();
    if (filtro === 'pendientes') return porFecha.filter((p) => p.pendientes > 0);
    return porFecha;
  }, [perfiles, filtro]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lista, comuna, categorias] = await Promise.all([
        fetchPerfilesDeCategoria(comunaId, categoriaId),
        fetchComuna(comunaId),
        fetchCategoriasAdmin(),
      ]);
      setPerfiles(lista);
      contarPublicacionesDeUsuarios(lista.map((p) => p.id))
        .then(setTotales)
        .catch(() => {});
      setComunaNombre(comuna?.nombre ?? 'Comuna');
      setTituloCategoria(categorias.find((c) => c.id === categoriaId)?.nombre ?? 'Categoría');
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido.'));
    } finally {
      setLoading(false);
    }
  }, [comunaId, categoriaId]);

  // Al volver de la ficha de un usuario se recarga: pudo ocultarse o
  // eliminarse desde allí.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /** Cambia algo del perfil en pantalla al tiro y lo guarda; si falla, vuelve atrás. */
  async function cambiar(perfil: PerfilEnCategoria, cambio: Partial<PerfilEnCategoria>, guardar: () => Promise<void>) {
    setPerfiles((list) => list.map((p) => (p.id === perfil.id ? { ...p, ...cambio } : p)));
    try {
      await guardar();
    } catch (err) {
      setPerfiles((list) => list.map((p) => (p.id === perfil.id ? perfil : p)));
      Alert.alert('No se pudo guardar', getErrorMessage(err, 'Intenta de nuevo.'));
    }
  }

  function abrir(perfil: PerfilEnCategoria) {
    const nuevo = abierto === perfil.id ? null : perfil.id;
    setAbierto(nuevo);
    if (nuevo && !(nuevo in correos)) {
      fetchCorreoDeCuenta(nuevo).then((correo) => setCorreos((c) => ({ ...c, [nuevo]: correo })));
    }
  }

  function handleEliminar(perfil: PerfilEnCategoria) {
    // Dos pasos: primero qué se elimina, y si es la cuenta entera, una
    // confirmación aparte. Es lo único de todo el panel que no se puede
    // deshacer.
    Alert.alert(`Eliminar “${perfil.nombre}”`, '¿Qué quieres eliminar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: `Solo sus publicaciones (${perfil.publicaciones})`,
        onPress: async () => {
          try {
            const borradas = await eliminarPublicacionesDePerfil(perfil.id);
            Alert.alert('Listo', `Se eliminaron ${borradas} publicaciones. La cuenta sigue activa.`);
            load();
          } catch (err) {
            setError(getErrorMessage(err, 'No se pudieron eliminar las publicaciones.'));
          }
        },
      },
      {
        text: 'El perfil completo',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            'Eliminar la cuenta',
            `Se borrará la cuenta de “${perfil.nombre}” con todas sus publicaciones y no se puede deshacer. ` +
              'Si solo quieres que deje de verse, cancela y usa el interruptor de ocultar.',
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Eliminar cuenta',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await eliminarPerfil(perfil.id);
                    load();
                  } catch (err) {
                    setError(getErrorMessage(err, 'No se pudo eliminar el perfil.'));
                  }
                },
              },
            ],
          ),
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Comuna y categoría juntas bajo el título: "Arica/Delivery". */}
      <EncabezadoMarca subtitulo={`${comunaNombre}/${tituloCategoria}`} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {perfiles.length > 0 && (
          <FiltrosOrden
            opciones={[
              { id: 'antiguos', label: 'Antiguos' },
              { id: 'recientes', label: 'Recientes' },
              { id: 'pendientes', label: 'Pendientes' },
            ]}
            elegida={filtro}
            onElegir={setFiltro}
          />
        )}

        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && perfiles.length === 0 && (
          <Text style={styles.vacio}>Todavía nadie publica en esta categoría dentro de esta comuna.</Text>
        )}
        {!loading && !error && perfiles.length > 0 && visibles.length === 0 && (
          <Text style={styles.vacio}>Nadie tiene publicaciones esperando aprobación en esta categoría.</Text>
        )}

        {visibles.map((perfil) => {
          const estaAbierto = abierto === perfil.id;
          const total = totales[perfil.id] ?? perfil.publicaciones;
          const esAdminGeneral = perfil.rol === 'admin';
          return (
            <TarjetaDesplegable
              key={perfil.id}
              titulo={perfil.nombre}
              abierta={estaAbierto}
              onAlternar={() => abrir(perfil)}
              junto={
                estaAbierto ? (
                  // El número abre todas sus publicaciones, en tarjetas.
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: '/(app)/admin/publicaciones', params: { usuario: perfil.id, nombre: perfil.nombre } })
                    }
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Ver las ${total} publicaciones de ${perfil.nombre}`}>
                    <Text style={styles.total}>({total})</Text>
                  </Pressable>
                ) : null
              }
              derecha={
                <>
                  <Interruptor
                    value={perfil.activo}
                    disabled={!esGeneral}
                    onValueChange={(activo) =>
                      void cambiar(perfil, { activo }, () => actualizarVisibilidadPerfil(perfil.id, activo))
                    }
                    accessibilityLabel={perfil.activo ? `Ocultar a ${perfil.nombre}` : `Mostrar a ${perfil.nombre}`}
                  />
                </>
              }>
              {/* Tocar el correo abre su ficha completa (teléfono, fechas, suspensión). */}
              <FilaDato
                etiqueta="Correo"
                valor={perfil.id in correos ? (correos[perfil.id] ?? 'sin correo') : 'cargando…'}
                onPress={() => router.push({ pathname: '/(app)/admin/usuario/[id]', params: { id: perfil.id } })}
              />
              {pendientesTexto(perfil)}
              <FilaInterruptor
                etiqueta="Directo"
                valor={perfil.nivel === 2 || esAdminGeneral}
                deshabilitado={!esGeneral || esAdminGeneral}
                onCambio={(directo) =>
                  void cambiar(perfil, { nivel: directo ? 2 : 1 }, () => actualizarNivelPerfil(perfil.id, directo ? 2 : 1))
                }
              />
              <FilaInterruptor
                etiqueta="Loguin"
                valor={!perfil.suspendida}
                deshabilitado={!puedeSuspender || esAdminGeneral}
                onCambio={(puedeEntrar) =>
                  void cambiar(perfil, { suspendida: !puedeEntrar }, () =>
                    puedeEntrar
                      ? reactivarCuenta(perfil.id)
                      : suspenderCuenta(perfil.id, 'Acceso desactivado desde el panel.', null),
                  )
                }
              />
              <FilaInterruptor
                etiqueta="Editar"
                valor={perfil.puede_editar}
                deshabilitado={!esGeneral || esAdminGeneral}
                onCambio={(puedeEditar) =>
                  void cambiar(perfil, { puede_editar: puedeEditar }, () => actualizarPuedeEditar(perfil.id, puedeEditar))
                }
              />
              {esGeneral && !esAdminGeneral && <AccionRoja texto="Eliminar" onPress={() => handleEliminar(perfil)} />}
            </TarjetaDesplegable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

/** "1 por aprobar": solo si tiene algo esperando. */
function pendientesTexto(perfil: PerfilEnCategoria) {
  if (perfil.pendientes === 0) return null;
  return (
    <Text style={styles.pendientes}>
      {perfil.pendientes} {perfil.pendientes === 1 ? 'publicación por aprobar' : 'publicaciones por aprobar'}
    </Text>
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
  vacio: {
    fontFamily: Fonts.delgada,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.four,
  },
  // El "(5)" junto al nombre, en rojo como la maqueta.
  total: {
    fontFamily: Fonts.tarjeta,
    fontSize: 27.5,
    color: Colors.accent,
  },
  pendientes: {
    fontFamily: Fonts.delgada,
    fontSize: 15,
    color: Colors.accent,
    textAlign: 'center',
  },
});
