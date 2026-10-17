import { FlashList } from '@shopify/flash-list';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FiltrosOrden } from '@/components/admin/FiltrosOrden';
import { TarjetaDeslizable } from '@/components/admin/TarjetaDeslizable';
import { MenuAcciones, type Accion } from '@/components/admin/MenuAcciones';
import { EmptyState, ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { ImageViewer } from '@/components/catalog/ImageViewer';
import { PublicacionCard } from '@/components/catalog/PublicacionCard';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Layout, Spacing } from '@/constants/theme';
import {
  PublicacionEnRevision,
  PublicacionResumen,
  aprobarPublicacion,
  darDeBajaPublicacion,
  fetchPublicacionesEnRevision,
  rechazarPublicacion,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';

/**
 * Publicaciones del panel mostradas en tarjetas, tal como se ven en el inicio
 * (maqueta "Últimos" del cliente). Se usa para:
 *
 *  - Las publicaciones de un usuario ("Usuario2 (5)").
 *  - Las pendientes de un usuario, de a una (`soloPendientes`).
 *
 * El Aprobar general es otra pantalla: AprobarLista.
 *
 * Tocar el nombre del comercio (que en el inicio lleva a WhatsApp) abre acá
 * lo que se puede hacer con esa publicación: aprobarla o rechazarla si está
 * pendiente, o darla de baja si ya está publicada. Tocar una foto la abre.
 */
export function RevisionEnTarjetas({
  soloPendientes,
  usuarioId,
  nombre,
}: {
  /** true = Aprobar: solo lo que espera aprobación. */
  soloPendientes?: boolean;
  /** Las de este usuario. */
  usuarioId?: string;
  /** Para el subtítulo: "Nombre (5)". Sin él dice "Últimos". */
  nombre?: string;
}) {
  const router = useRouter();
  const [lista, setLista] = useState<PublicacionEnRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Primero "Antiguos", y elegido de entrada (pedido del cliente): lo que
  // lleva más tiempo esperando se revisa primero.
  const [orden, setOrden] = useState<'recientes' | 'antiguos'>('antiguos');
  const [elegida, setElegida] = useState<PublicacionEnRevision | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  /** Fotos que faltan por ver de la publicación en pantalla (Aprobar). */
  const [porVer, setPorVer] = useState(0);
  const [avisoFotos, setAvisoFotos] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLista(await fetchPublicacionesEnRevision({ soloPendientes, usuarioId }));
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudieron cargar las publicaciones.'));
    } finally {
      setLoading(false);
    }
  }, [soloPendientes, usuarioId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Llegan de la más reciente a la más antigua.
  const ordenadas = useMemo(() => (orden === 'recientes' ? lista : [...lista].reverse()), [lista, orden]);

  /** Hace la acción y saca la publicación de la lista (o la recarga, si sigue correspondiendo). */
  async function hacer(publicacion: PublicacionEnRevision, accion: () => Promise<void>, error: string) {
    try {
      await accion();
      await load();
    } catch (err) {
      Alert.alert(error, getErrorMessage(err, 'Intenta de nuevo.'));
    }
  }

  /**
   * Aprobar o rechazar con un gesto (Aprobar en tarjetas): la publicación sale
   * de la pantalla al tiro y aparece la siguiente; si la base no lo acepta,
   * vuelve a la lista y se avisa.
   */
  async function decidir(p: PublicacionEnRevision, aprobar: boolean) {
    setLista((l) => l.filter((x) => x.id !== p.id));
    try {
      await (aprobar ? aprobarPublicacion(p.id) : rechazarPublicacion(p.id));
    } catch (err) {
      setLista((l) => (l.some((x) => x.id === p.id) ? l : [p, ...l]));
      Alert.alert(aprobar ? 'No se pudo aprobar' : 'No se pudo rechazar', getErrorMessage(err, 'Intenta de nuevo.'));
    }
  }

  function acciones(p: PublicacionEnRevision): Accion[] {
    const lista: Accion[] = [];
    if (p.estado === 'pendiente') {
      lista.push({
        label: 'Aprobar',
        onPress: () => hacer(p, () => aprobarPublicacion(p.id), 'No se pudo aprobar'),
      });
      lista.push({
        label: 'Rechazar',
        peligrosa: true,
        onPress: () =>
          Alert.alert('Rechazar publicación', `"${p.titulo}" no se va a publicar.`, [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Rechazar', style: 'destructive', onPress: () => hacer(p, () => rechazarPublicacion(p.id), 'No se pudo rechazar') },
          ]),
      });
    } else {
      lista.push({
        label: 'Dar de baja',
        peligrosa: true,
        onPress: () =>
          Alert.alert('Dar de baja', `"${p.titulo}" sale del catálogo.`, [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Dar de baja', style: 'destructive', onPress: () => hacer(p, () => darDeBajaPublicacion(p.id), 'No se pudo dar de baja') },
          ]),
      });
    }
    if (!usuarioId) {
      lista.push({
        label: 'Ver ficha del usuario',
        onPress: () => router.push({ pathname: '/(app)/admin/usuario/[id]', params: { id: p.usuario_id } }),
      });
    }
    return lista;
  }

  const etiquetaEstado = (p: PublicacionEnRevision) =>
    p.estado === 'pendiente' ? 'Por aprobar' : p.estado === 'rechazado' ? 'Rechazada' : null;

  const renderItem = useCallback(
    ({ item }: { item: PublicacionEnRevision }) => {
      const estado = soloPendientes ? null : etiquetaEstado(item);
      return (
        <View>
          {estado && <Text style={styles.estado}>{estado}</Text>}
          <PublicacionCard
            key={item.id}
            publicacion={item}
            onContactar={(p: PublicacionResumen) => setElegida(lista.find((x) => x.id === p.id) ?? null)}
            onVerFoto={setFoto}
          />
        </View>
      );
    },
    [soloPendientes, lista],
  );

  const subtitulo = `${nombre ?? 'Últimos'} (${lista.length})`;

  const filtros = soloPendientes ? (
    <FiltrosOrden
      opciones={[
        { id: 'antiguos', label: 'Antiguos' },
        { id: 'recientes', label: 'Recientes' },
      ]}
      elegida={orden}
      onElegir={setOrden}
    />
  ) : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <EncabezadoMarca subtitulo={subtitulo} />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && lista.length === 0 && (
        <>
          <EmptyState
          title={soloPendientes ? 'Todo al día' : 'Sin publicaciones'}
          message={soloPendientes ? 'No hay publicaciones esperando revisión.' : 'Este usuario no tiene publicaciones.'}
          />
        </>
      )}

      {/* Aprobar: de a una, como un feed. Arrastrar a la derecha rechaza;
          hacia arriba (o dos toques en la parte blanca) aprueba. */}
      {!loading && !error && lista.length > 0 && soloPendientes && (
        <View style={styles.feed}>
          {filtros}
          <TarjetaDeslizable
            key={ordenadas[0].id}
            onRechazar={() => decidir(ordenadas[0], false)}
            onAprobar={() => decidir(ordenadas[0], true)}
            puedeAprobar={porVer === 0}
            onAprobarBloqueado={() => {
              setAvisoFotos(true);
              setTimeout(() => setAvisoFotos(false), 2500);
            }}>
            <PublicacionCard
              key={ordenadas[0].id}
              publicacion={ordenadas[0]}
              onFotosPorVer={setPorVer}
              onContactar={(p: PublicacionResumen) => setElegida(lista.find((x) => x.id === p.id) ?? null)}
              onVerFoto={setFoto}
              onDobleToquePanel={() => decidir(ordenadas[0], true)}
            />
          </TarjetaDeslizable>
          {avisoFotos && (
            <Text style={styles.avisoFotos}>
              {porVer === 1 ? 'Falta 1 foto por ver' : `Faltan ${porVer} fotos por ver`} antes de aprobar deslizando.
            </Text>
          )}
        </View>
      )}

      {!loading && !error && lista.length > 0 && !soloPendientes && (
        <FlashList
          data={ordenadas}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: Layout.catalogMargin, paddingBottom: Spacing.five }}
          ItemSeparatorComponent={Separador}
          ListHeaderComponent={
            <FiltrosOrden
              opciones={[
                { id: 'antiguos', label: 'Antiguos' },
                { id: 'recientes', label: 'Recientes' },
              ]}
              elegida={orden}
              onElegir={setOrden}
            />
          }
        />
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
  feed: {
    flex: 1,
    paddingHorizontal: Layout.catalogMargin,
  },
  avisoFotos: {
    fontFamily: Fonts.medium,
    fontSize: 15,
    color: Colors.accent,
    textAlign: 'center',
    marginTop: Spacing.three,
  },
  estado: {
    fontFamily: Fonts.delgada,
    fontSize: 15,
    color: Colors.accent,
    marginBottom: Spacing.one,
  },
});
