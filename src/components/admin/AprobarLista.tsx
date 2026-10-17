import { FlashList } from '@shopify/flash-list';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FiltrosOrden } from '@/components/admin/FiltrosOrden';
import { MenuAcciones, type Accion } from '@/components/admin/MenuAcciones';
import { TarjetaBanner } from '@/components/admin/TarjetaBanner';
import { TarjetaDeslizable } from '@/components/admin/TarjetaDeslizable';
import { EmptyState, ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { ImageViewer } from '@/components/catalog/ImageViewer';
import { PublicacionCard } from '@/components/catalog/PublicacionCard';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Layout, Colors, Spacing } from '@/constants/theme';
import {
  BannerEnRevision,
  PublicacionEnRevision,
  aprobarBanner,
  aprobarPublicacion,
  fetchBannersPendientes,
  fetchPublicacionesEnRevision,
  rechazarBanner,
  rechazarPublicacion,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';

type Orden = 'recientes' | 'antiguos' | 'az' | 'za';

/** Algo que espera aprobación: una publicación o un banner. */
type Item =
  | { tipo: 'publicacion'; id: string; fecha: string; nombre: string; publicacion: PublicacionEnRevision }
  | { tipo: 'banner'; id: string; fecha: string; nombre: string; banner: BannerEnRevision };

/**
 * Aprobar (pedido del cliente), con dos vistas: "Publicaciones (N)" y
 * "Banners (N)". Dos toques en el logo pasan de una a otra. Cada vista
 * muestra todo lo suyo en una sola lista, en tarjetas como las del inicio, y
 * se ordena igual: Recientes, Antiguos (parte acá: lo que más espera se
 * revisa primero), A-Z y Z-A por el nombre del comercio.
 *
 * En cada tarjeta: arrastrar a la derecha rechaza y dos toques aprueban (en
 * la parte blanca de una publicación, en la imagen de un banner). Hacia
 * arriba no se arrastra: en una lista eso es desplazarse.
 */
export function AprobarLista() {
  const [publicaciones, setPublicaciones] = useState<PublicacionEnRevision[]>([]);
  const [banners, setBanners] = useState<BannerEnRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<'publicaciones' | 'banners'>('publicaciones');
  const [orden, setOrden] = useState<Orden>('antiguos');
  const [foto, setFoto] = useState<string | null>(null);
  const [elegida, setElegida] = useState<PublicacionEnRevision | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [pubs, bans] = await Promise.all([
        fetchPublicacionesEnRevision({ soloPendientes: true }),
        fetchBannersPendientes(),
      ]);
      setPublicaciones(pubs);
      setBanners(bans);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo cargar lo que espera aprobación.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const items = useMemo(() => {
    const pubs: Item[] = publicaciones.map((p) => ({
      tipo: 'publicacion',
      id: p.id,
      fecha: p.created_at,
      nombre: p.titulo,
      publicacion: p,
    }));
    const bans: Item[] = banners.map((b) => ({
      tipo: 'banner',
      id: b.id,
      fecha: b.created_at,
      nombre: b.autor?.nombre ?? '',
      banner: b,
    }));
    const todos = vista === 'banners' ? bans : pubs;
    if (orden === 'az' || orden === 'za') {
      todos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      return orden === 'za' ? todos.reverse() : todos;
    }
    todos.sort((a, b) => a.fecha.localeCompare(b.fecha));
    return orden === 'recientes' ? todos.reverse() : todos;
  }, [publicaciones, banners, vista, orden]);

  /** Sale de la lista al tiro; si la base no lo acepta, vuelve y se avisa. */
  async function decidir(item: Item, aprobar: boolean) {
    if (item.tipo === 'publicacion') {
      const p = item.publicacion;
      setPublicaciones((l) => l.filter((x) => x.id !== p.id));
      try {
        await (aprobar ? aprobarPublicacion(p.id) : rechazarPublicacion(p.id));
      } catch (err) {
        setPublicaciones((l) => (l.some((x) => x.id === p.id) ? l : [p, ...l]));
        Alert.alert(aprobar ? 'No se pudo aprobar' : 'No se pudo rechazar', getErrorMessage(err, 'Intenta de nuevo.'));
      }
    } else {
      const b = item.banner;
      setBanners((l) => l.filter((x) => x.id !== b.id));
      try {
        await (aprobar ? aprobarBanner(b.id) : rechazarBanner(b.id));
      } catch (err) {
        setBanners((l) => (l.some((x) => x.id === b.id) ? l : [b, ...l]));
        Alert.alert(aprobar ? 'No se pudo aprobar' : 'No se pudo rechazar', getErrorMessage(err, 'Intenta de nuevo.'));
      }
    }
  }

  /** Tocar el nombre del comercio: Aprobar o Rechazar con un botón. */
  function acciones(p: PublicacionEnRevision): Accion[] {
    const item: Item = { tipo: 'publicacion', id: p.id, fecha: p.created_at, nombre: p.titulo, publicacion: p };
    return [
      { label: 'Aprobar', onPress: () => void decidir(item, true) },
      {
        label: 'Rechazar',
        peligrosa: true,
        onPress: () =>
          Alert.alert('Rechazar publicación', `"${p.titulo}" no se va a publicar.`, [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Rechazar', style: 'destructive', onPress: () => void decidir(item, false) },
          ]),
      },
    ];
  }

  const subtitulo = vista === 'banners' ? `Banners (${banners.length})` : `Publicaciones (${publicaciones.length})`;

  const filtros = (
    <View style={styles.filtros}>
      <FiltrosOrden
        opciones={[
          { id: 'recientes', label: 'Recientes' },
          { id: 'antiguos', label: 'Antiguos' },
          { id: 'az', label: 'A-Z' },
          { id: 'za', label: 'Z-A' },
        ]}
        elegida={orden}
        onElegir={setOrden}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <EncabezadoMarca
        subtitulo={subtitulo}
        onDobleToque={() => setVista((v) => (v === 'banners' ? 'publicaciones' : 'banners'))}
      />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && (
        <>
          {filtros}
          {items.length === 0 ? (
            <EmptyState
              title="Todo al día"
              message={
                vista === 'banners' ? 'No hay banners esperando revisión.' : 'No hay publicaciones esperando revisión.'
              }
            />
          ) : (
            <FlashList
              data={items}
              keyExtractor={(i) => `${i.tipo}-${i.id}`}
              getItemType={(i) => i.tipo}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.lista}
              ItemSeparatorComponent={Separador}
              renderItem={({ item }) => (
                <TarjetaDeslizable
                  onRechazar={() => decidir(item, false)}
                  onAprobar={() => decidir(item, true)}
                  soloRechazar>
                  {item.tipo === 'publicacion' ? (
                    <PublicacionCard
                      publicacion={item.publicacion}
                      onContactar={() => setElegida(item.publicacion)}
                      onVerFoto={setFoto}
                      onDobleToquePanel={() => decidir(item, true)}
                    />
                  ) : (
                    <TarjetaBanner banner={item.banner} onDobleToque={() => decidir(item, true)} conDatos />
                  )}
                </TarjetaDeslizable>
              )}
            />
          )}
        </>
      )}

      <MenuAcciones
        visible={elegida !== null}
        titulo={elegida?.titulo ?? ''}
        onClose={() => setElegida(null)}
        acciones={elegida ? acciones(elegida) : []}
      />
      <ImageViewer images={foto ? [foto] : []} visible={foto !== null} initialIndex={0} onClose={() => setFoto(null)} />
    </SafeAreaView>
  );
}

/** Entre tarjeta y tarjeta, lo mismo que en el inicio: el margen lateral. */
function Separador() {
  return <View style={{ height: Layout.catalogMargin }} />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  filtros: {
    paddingHorizontal: Layout.catalogMargin,
  },
  lista: {
    paddingHorizontal: Layout.catalogMargin,
    paddingBottom: Spacing.five,
  },
});
