import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Texto';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { comunasEnMemoria } from '@/lib/cacheAdmin';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Interruptor } from '@/components/ui/Interruptor';
import { AccionRoja, FilaContacto, FilaInterruptor, TarjetaDesplegable } from '@/components/admin/TarjetaDesplegable';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { puede } from '@/lib/administradores';
import {
  BannerEnRevision,
  PerfilEnCategoria,
  actualizarNivelPerfil,
  fetchBannersPendientes,
  actualizarPuedeEditar,
  actualizarVisibilidadPerfil,
  fetchCorreoDeCuenta,
  reactivarCuenta,
  suspenderCuenta,
  eliminarPerfil,
  eliminarPublicacionesDePerfil,
  fetchCategoriasAdmin,
  fetchComuna,
  fetchPerfilesDeCategoria,
} from '@/lib/catalog';
import { celularLocal } from '@/lib/validation';
import { getErrorMessage } from '@/lib/errors';
import { escribirPorWhatsApp } from '@/lib/whatsapp';
import { useSession } from '@/providers/SessionProvider';
import { REJILLA, u } from '@/lib/rejilla';
import { FiltrosOrden } from '@/components/admin/FiltrosOrden';

/**
 * Los perfiles que publican en una categoría dentro de una comuna, en
 * tarjetas que se abren y se cierran (maqueta del cliente). Abierta, cada una
 * muestra:
 *  - junto al nombre, las fotos que tiene por revisar en sus publicaciones
 *    pendientes ("(7)"; sin pendientes no sale): al tocarlo se revisan de a
 *    una, con "Aprobar" / "No" y los gestos de Aprobar;
 *  - mantener presionado el nombre abre sus publicaciones activas (y sus
 *    banners), en tarjetas como las del inicio;
 *  - a la derecha, el interruptor de visible/oculto del administrador. Es
 *    distinto de la pausa que el propio comerciante maneja desde su perfil
 *    (0038): si se lo apaga acá, él no lo puede volver a prender;
 *  - su WhatsApp (tocar la palabra lo cambia a su correo; tocar el dato le
 *    escribe por ahí);
 *  - tres permisos: Directo (publica sin pasar por Aprobar; todos parten sin
 *    él y solo el general lo da), Loguin (puede entrar a su cuenta; apagado
 *    es un bloqueo temporal, la contraseña no cambia) y Editar (puede cambiar
 *    lo que publicó). Sin Loguin tampoco edita;
 *  - "Eliminar".
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
  /** Banners esperando revisión en esta comuna (para la lista "Banner"). */
  const [bannersPendientes, setBannersPendientes] = useState<BannerEnRevision[]>([]);
  /**
   * Las cinco listas (pedido del cliente), en este orden y partiendo por
   * "Nuevo":
   *  - Nuevo / Anterior / Alfabético: TODOS los perfiles, en tarjetas que se
   *    despliegan; por fecha de registro (nuevos arriba o al revés) o por
   *    nombre de la A a la Z;
   *  - Publicación / Banner: solo quienes tienen publicaciones o banners por
   *    aprobar, en una lista simple con cuántos; no se despliegan: tocar el
   *    nombre lleva a aprobar. Arriba los que más tiempo llevan esperando.
   */
  const [filtro, setFiltro] = useState<'nuevo' | 'anterior' | 'alfabetico' | 'publicacion' | 'banner'>('nuevo');
  const visibles = useMemo(() => {
    if (filtro === 'alfabetico') return [...perfiles].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const porFecha = [...perfiles].sort((a, b) => a.created_at.localeCompare(b.created_at));
    return filtro === 'nuevo' ? porFecha.reverse() : porFecha;
  }, [perfiles, filtro]);

  /** Banners por aprobar de cada perfil, y desde cuándo espera el más antiguo. */
  const bannersPorPerfil = useMemo(() => {
    // Llegan del que más espera al más reciente: el primero de cada perfil
    // es desde cuándo espera.
    const grupos = new Map<string, { id: string; nombre: string; cuantos: number; desde: string }>();
    for (const b of bannersPendientes) {
      const grupo = grupos.get(b.usuario_id);
      if (grupo) grupo.cuantos += 1;
      else grupos.set(b.usuario_id, { id: b.usuario_id, nombre: b.autor?.nombre ?? 'Comerciante', cuantos: 1, desde: b.created_at });
    }
    return grupos;
  }, [bannersPendientes]);

  /** La lista simple de "Publicación" o "Banner", de lo que más espera a lo más reciente. */
  const porAprobar = useMemo(() => {
    if (filtro === 'publicacion') {
      return perfiles
        .filter((p) => p.pendientes > 0)
        .sort((a, b) => (a.pendienteDesde ?? '').localeCompare(b.pendienteDesde ?? ''))
        .map((p) => ({ id: p.id, nombre: p.nombre, cuantos: p.pendientes }));
    }
    return [...bannersPorPerfil.values()].sort((a, b) => a.desde.localeCompare(b.desde));
  }, [filtro, perfiles, bannersPorPerfil]);
  const listaSimple = filtro === 'publicacion' || filtro === 'banner';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lista, comuna, categorias, banners] = await Promise.all([
        fetchPerfilesDeCategoria(comunaId, categoriaId),
        fetchComuna(comunaId),
        fetchCategoriasAdmin(),
        fetchBannersPendientes({ comunaId }).catch(() => [] as BannerEnRevision[]),
      ]);
      setPerfiles(lista);
      setBannersPendientes(banners);
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

  /** Abre el perfil en tarjetas: sus activas (y banners), sus pendientes o sus banners por aprobar. */
  function verEnTarjetas(perfil: { id: string }, modo: 'activas' | 'pendientes' | 'banners') {
    router.push({
      pathname: '/(app)/admin/perfil-tarjetas',
      params: { usuario: perfil.id, comuna: comunaId, categoria: categoriaId, titulo: `${comunaNombre}/${tituloCategoria}`, modo },
    });
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
        {(perfiles.length > 0 || bannersPendientes.length > 0) && (
          <FiltrosOrden
            opciones={[
              { id: 'nuevo', label: 'Nuevo' },
              { id: 'anterior', label: 'Anterior' },
              { id: 'alfabetico', label: 'Alfabético' },
              { id: 'publicacion', label: 'Publicación' },
              { id: 'banner', label: 'Banner' },
            ]}
            elegida={filtro}
            onElegir={setFiltro}
          />
        )}

        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && !listaSimple && perfiles.length === 0 && (
          <Text style={styles.vacio}>Todavía nadie publica en esta categoría dentro de esta comuna.</Text>
        )}
        {!loading && !error && listaSimple && porAprobar.length === 0 && (
          <Text style={styles.vacio}>
            {filtro === 'publicacion'
              ? 'Nadie tiene publicaciones esperando aprobación en esta categoría.'
              : 'Nadie tiene banners esperando aprobación en esta comuna.'}
          </Text>
        )}

        {/* Publicación / Banner, lista simple: no se despliega; tocar (o
            mantener presionado) el nombre abre lo suyo para aprobar. */}
        {!loading &&
          !error &&
          listaSimple &&
          porAprobar.map((fila) => {
            const abrirParaAprobar = () => verEnTarjetas(fila, filtro === 'banner' ? 'banners' : 'pendientes');
            return (
              <TarjetaDesplegable
                key={fila.id}
                titulo={fila.nombre}
                abierta={false}
                onAlternar={abrirParaAprobar}
                onMantenerTitulo={abrirParaAprobar}
                pistaMantener="Abre lo suyo para aprobar"
                alFinal={<Text style={styles.cuantos}>{fila.cuantos}</Text>}
              />
            );
          })}

        {!listaSimple && visibles.map((perfil) => {
          const estaAbierto = abierto === perfil.id;
          const esAdminGeneral = perfil.rol === 'admin';
          // Lo que espera aprobación: sus publicaciones de esta categoría y
          // sus banners de esta comuna.
          const bannersSuyos = bannersPorPerfil.get(perfil.id)?.cuantos ?? 0;
          const porAprobarSuyo = perfil.pendientes + bannersSuyos;
          return (
            <TarjetaDesplegable
              key={perfil.id}
              titulo={perfil.nombre}
              abierta={estaAbierto}
              onAlternar={() => abrir(perfil)}
              // Mantener presionado el nombre: sus publicaciones activas, en tarjetas.
              onMantenerTitulo={() => verEnTarjetas(perfil, 'activas')}
              pistaMantener="Mantén apretado para ver sus publicaciones"
              junto={
                estaAbierto && porAprobarSuyo > 0 ? (
                  // Publicaciones + banners por aprobar: abre las
                  // publicaciones (o, si no tiene, los banners) para aprobar.
                  <Pressable
                    onPress={() => verEnTarjetas(perfil, perfil.pendientes > 0 ? 'pendientes' : 'banners')}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Aprobar lo pendiente de ${perfil.nombre} (${porAprobarSuyo})`}>
                    <Text style={styles.total}>({porAprobarSuyo})</Text>
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
              <FilaContacto
                whatsapp={perfil.telefono_contacto ? celularLocal(perfil.telefono_contacto) : null}
                correo={perfil.id in correos ? correos[perfil.id] : undefined}
                onWhatsApp={() => perfil.telefono_contacto && void escribirPorWhatsApp(perfil.telefono_contacto)}
                onCorreo={() => correos[perfil.id] && void Linking.openURL(`mailto:${correos[perfil.id]}`)}
              />
              {perfil.pausado && <Text style={styles.pausado}>Pausado por el comerciante</Text>}
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
              {/* Sin Loguin no entra, así que tampoco edita. */}
              <FilaInterruptor
                etiqueta="Editar"
                valor={perfil.puede_editar && !perfil.suspendida}
                deshabilitado={!esGeneral || esAdminGeneral || perfil.suspendida}
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
  // El número de la lista simple, en rojo contra el borde derecho.
  cuantos: {
    fontFamily: Fonts.tarjeta,
    fontSize: 27.5,
    color: Colors.accent,
  },
  pausado: {
    fontFamily: Fonts.delgada,
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
