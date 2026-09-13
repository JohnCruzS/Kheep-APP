import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BannerCarousel } from '@/components/catalog/BannerCarousel';
import { EmptyState, ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { CategoryChips } from '@/components/catalog/CategoryChips';
import { ComunaPicker } from '@/components/catalog/ComunaPicker';
import { PublicacionCard } from '@/components/catalog/PublicacionCard';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { invalidarMarca, useMarca } from '@/lib/marca';
import { Colors, Layout, Spacing } from '@/constants/theme';
import {
  Banner,
  Categoria,
  Comuna,
  PublicacionResumen,
  fetchBanners,
  fetchCategorias,
  fetchComunas,
  fetchPublicaciones,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { leerUsoCategorias, ordenarPorUso, registrarUsoCategoria } from '@/lib/preferencias';
import { useSession } from '@/providers/SessionProvider';
import { useUbicacion } from '@/providers/UbicacionProvider';

/**
 * Cuánto se mete la primera tarjeta dentro de la zona negra: en la plantilla
 * el negro no termina donde empieza la tarjeta, sino ~41dp más abajo, así la
 * tarjeta queda "montada" sobre el cambio de fondo negro → gris.
 */
const SOLAPE_TARJETA = 41;
/** Espacio entre la fila de categorías y el borde superior de la tarjeta. */
const ESPACIO_CATEGORIAS_TARJETA = 21;

export default function DashboardScreen() {
  const router = useRouter();
  const { session } = useSession();
  const insets = useSafeAreaInsets();
  // El margen desde arriba hasta el título lo fija el admin (Panel Admin →
  // Logo de la app), como % del ALTO de la pantalla — ver src/lib/marca.ts.
  // No es % del ancho como el resto de `Layout`: es una medida vertical.
  const { margenSuperiorPct } = useMarca();
  // Se mide desde el borde FÍSICO de la pantalla, que es como lo midió el
  // cliente en su plantilla. Por eso se descuenta la franja de la barra de
  // estado: el encabezado ya vive dentro de un área segura que la reserva, y
  // sin restarla el margen real quedaba ~2,7 puntos por encima del valor
  // configurado (12 % pedido → 14,7 % dibujado en una pantalla de 2400).
  const margenSuperior = Math.max(
    0,
    Math.round((Dimensions.get('window').height * margenSuperiorPct) / 100) - insets.top,
  );

  // Datos "de vitrina": banners, categorías y comunas casi no cambian
  // sesión a sesión — se piden UNA vez al entrar, nunca de nuevo solo
  // porque el usuario escribió una letra o tocó una categoría. Antes todo
  // esto vivía en el mismo `load()` que las publicaciones y se volvía a
  // pedir en cada filtro — se sentía con tirones y gastaba consultas de
  // más contra Supabase.
  const [banners, setBanners] = useState<Banner[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [comunas, setComunas] = useState<Comuna[]>([]);

  const [publicaciones, setPublicaciones] = useState<PublicacionResumen[]>([]);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  // La comuna no es estado de esta pantalla: se resolvió antes de entrar (en
  // la bienvenida) y queda guardada en el teléfono, así que al volver a abrir
  // la app el catálogo ya arranca en la comuna del usuario.
  const { comunaId, elegirComuna } = useUbicacion();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publicacionesRef = useRef<PublicacionResumen[]>([]);

  // Banners: se vuelven a pedir cada vez que se regresa a Inicio. La
  // pestaña queda montada todo el tiempo, y mientras tanto el admin puede
  // eliminar un banner (o un comerciante activar uno nuevo): si se pidieran
  // una sola vez, el carrusel seguiría mostrando los viejos hasta cerrar la
  // app. Es una sola consulta liviana.
  const recargarBanners = useCallback(() => {
    // De paso se vuelve a preguntar por el título: así el logo especial que
    // programó el admin (y el tamaño que le puso) llega al resto de los
    // usuarios sin que tengan que cerrar y abrir la app, y el que vence hoy
    // desaparece solo.
    invalidarMarca();
    fetchBanners()
      .then(setBanners)
      .catch(() => {
        // Si falla, se queda con los que ya tenía: no vale la pena un error visible.
      });
  }, []);
  useFocusEffect(recargarBanners);

  // Categorías: igual que los banners, se vuelven a pedir cada vez que se
  // regresa a Inicio. La pestaña queda montada todo el tiempo y mientras
  // tanto el admin puede crear o eliminar una categoría; si se pidieran una
  // sola vez, la eliminada seguiría apareciendo en el catálogo hasta cerrar
  // la app. El orden que ya se está mostrando se conserva —reordenar en vivo
  // movería un chip justo debajo del dedo—: las nuevas entran al final y las
  // eliminadas simplemente desaparecen.
  const ordenMostrado = useRef<string[] | null>(null);
  const recargarCategorias = useCallback(() => {
    Promise.all([fetchCategorias(comunaId), leerUsoCategorias()])
      .then(([categoriasData, uso]) => {
        const previo = ordenMostrado.current;
        const ordenadas = previo
          ? [
              ...previo
                .map((id) => categoriasData.find((c) => c.id === id))
                .filter((c): c is Categoria => c !== undefined),
              ...categoriasData.filter((c) => !previo.includes(c.id)),
            ]
          : // Primera carga: orden del admin + las más usadas por este usuario.
            ordenarPorUso(categoriasData, uso);
        ordenMostrado.current = ordenadas.map((c) => c.id);
        setCategorias(ordenadas);
        // Si el filtro activo era la categoría recién eliminada, el catálogo
        // quedaría vacío para siempre: se vuelve a "Todas".
        setCategoriaId((actual) => (actual && !ordenadas.some((c) => c.id === actual) ? null : actual));
      })
      .catch(() => {
        // Se queda con las que ya tenía; un catálogo sin chips no es un error
        // que valga la pena mostrarle al usuario.
      });
  }, [comunaId]);
  useFocusEffect(recargarCategorias);

  // Cada comuna puede tener su propia lista de categorías (el admin la arma
  // comuna por comuna), así que al cambiar de comuna hay que pedirla de
  // nuevo. El orden mostrado se descarta: es el de la lista anterior y
  // conservarlo dejaría arriba categorías que esta comuna ni siquiera tiene.
  const primeraCarga = useRef(true);
  useEffect(() => {
    if (primeraCarga.current) {
      primeraCarga.current = false;
      return;
    }
    ordenMostrado.current = null;
    setCategoriaId(null);
    recargarCategorias();
  }, [comunaId, recargarCategorias]);

  // Comunas: una sola vez al montar (las administra el admin y casi no
  // cambian). Solo para llenar el selector del encabezado — cuál está
  // elegida ya se decidió en la bienvenida.
  useEffect(() => {
    fetchComunas()
      .then(setComunas)
      .catch((err) => setError(getErrorMessage(err, 'Error desconocido.')));
  }, []);

  // Publicaciones: se cargan de nuevo cada vez (y solo) que cambia un
  // filtro real — categoría, comuna o la búsqueda ya "asentada".
  const loadPublicaciones = useCallback(
    async ({ isRefresh = false }: { isRefresh?: boolean } = {}) => {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const data = await fetchPublicaciones({ categoriaId, comunaId });
        publicacionesRef.current = data;
        setPublicaciones(data);
      } catch (err) {
        setError(getErrorMessage(err, 'Error desconocido.'));
      } finally {
        isRefresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [categoriaId, comunaId],
  );

  useEffect(() => {
    loadPublicaciones();
  }, [loadPublicaciones]);

  // Abrir una publicación también cuenta como interés en su categoría. Se
  // busca en una ref (no en el estado) para que este callback no cambie con
  // cada carga y las tarjetas memoizadas no se vuelvan a dibujar.
  const handleOpenPublicacion = useCallback(
    (id: string) => {
      registrarUsoCategoria(publicacionesRef.current.find((p) => p.id === id)?.categoria_id);
      router.push({ pathname: '/(app)/publicacion/[id]', params: { id } });
    },
    [router],
  );

  const handleSeleccionarCategoria = useCallback((id: string | null) => {
    registrarUsoCategoria(id);
    setCategoriaId(id);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: PublicacionResumen }) => <PublicacionCard publicacion={item} onPress={handleOpenPublicacion} />,
    [handleOpenPublicacion],
  );

  const keyExtractor = useCallback((item: PublicacionResumen) => item.id, []);

  // El solape solo tiene sentido si hay tarjetas; con la lista cargando,
  // vacía o con error, el negro termina normal y no tapa esos mensajes.
  const solapar = !loading && !error && publicaciones.length > 0;

  return (
    <View style={styles.screen}>
      {/* Encabezado fijo: logo, comuna, banner y categorías no se mueven.
          Lo único que se desplaza es la lista de publicaciones, que pasa por
          debajo de ellos. */}
      <SafeAreaView
        edges={['top']}
        style={[
          styles.encabezado,
          { paddingBottom: ESPACIO_CATEGORIAS_TARJETA + (solapar ? SOLAPE_TARJETA : 0) },
        ]}>
        <View style={[styles.header, { paddingTop: margenSuperior }]}>
          {/* Sin sesión el logo es el acceso a la cuenta: no hay barra
              inferior que lleve a "Perfil". Con sesión no hace falta,
              porque la barra ya está ahí. */}
          {session ? (
            <BrandLogo />
          ) : (
            <Pressable
              onPress={() => router.push('/(auth)/login')}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Iniciar sesión o crear cuenta">
              <BrandLogo />
            </Pressable>
          )}
          <ComunaPicker comunas={comunas} selectedId={comunaId} onSelect={elegirComuna} />
        </View>

        {/* La key cambia si cambia la lista: el carrusel parte de cero en vez
            de quedar apuntando a un banner que ya no existe. */}
        <BannerCarousel key={banners.map((b) => b.id).join(',')} banners={banners} />
        <CategoryChips categorias={categorias} selectedId={categoriaId} onSelect={handleSeleccionarCategoria} />
      </SafeAreaView>

      <View style={styles.zonaScroll}>
        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={() => loadPublicaciones()} />}

        {!loading && !error && (
          <FlatList
            // El margen negativo sube la lista dentro de la franja negra: la
            // primera tarjeta queda montada sobre el cambio de fondo y, al
            // desplazarse, las tarjetas se recortan justo ahí, porque una
            // lista no dibuja fuera de sus propios límites.
            style={[styles.list, solapar && { marginTop: -SOLAPE_TARJETA }]}
            data={publicaciones}
            keyExtractor={keyExtractor}
            contentContainerStyle={[
              styles.listContent,
              // Sin sesión no hay barra de pestañas: la última tarjeta debe poder
              // quedar por encima de los botones del sistema al terminar el scroll.
              !session && { paddingBottom: Spacing.five + insets.bottom },
            ]}
            onRefresh={() => {
              recargarBanners();
              loadPublicaciones({ isRefresh: true });
            }}
            refreshing={refreshing}
            renderItem={renderItem}
            // La lista rara vez pasa de 20-30 tarjetas en una comuna, pero estos
            // ajustes evitan que React Native intente montar/medir de más de
            // una vez — es lo que se nota como scroll "fluido" de verdad.
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={7}
            removeClippedSubviews
            ItemSeparatorComponent={ItemSeparator}
            ListEmptyComponent={
              <EmptyState title="No encontramos comercios" message="Prueba con otra categoría o cambia de comuna." />
            }
          />
        )}
      </View>
    </View>
  );
}

function ItemSeparator() {
  return <View style={{ height: Spacing.three }} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  // Encabezado fijo, sobre negro y de borde a borde.
  encabezado: {
    backgroundColor: Colors.background,
    paddingHorizontal: Layout.catalogMargin,
  },
  header: {
    alignItems: 'center',
    // paddingTop viene del margen superior configurado por el admin (ver
    // arriba); acá solo queda el espacio fijo de abajo, hacia el banner.
    paddingBottom: 22,
  },
  // Única zona que se desplaza. El gris claro empieza donde termina el negro;
  // la lista va transparente y corrida hacia arriba, para que las tarjetas se
  // vean sobre el negro antes de recortarse.
  zonaScroll: {
    flex: 1,
    backgroundColor: Colors.backgroundSoft,
  },
  list: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: Layout.catalogMargin,
    paddingBottom: Spacing.five,
  },
});
