import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BannerCarousel } from '@/components/catalog/BannerCarousel';
import { EmptyState, ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { CategoryChips } from '@/components/catalog/CategoryChips';
import { ImageViewer } from '@/components/catalog/ImageViewer';
import { ComunaPicker } from '@/components/catalog/ComunaPicker';
import { PublicacionCard } from '@/components/catalog/PublicacionCard';
import { TituloPosicionado } from '@/components/ui/BrandLogo';
import { PERIMETRO_ALTO, invalidarMarca, useMarca } from '@/lib/marca';
import { Colors, Layout, Spacing } from '@/constants/theme';
import {
  Banner,
  Categoria,
  Comuna,
  PublicacionResumen,
  fetchBanners,
  fetchCategorias,
  fetchCategoriasConContenido,
  fetchComunas,
  fetchPublicaciones,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { ordenarCatalogo } from '@/lib/ordenCatalogo';
import { leerUsoCategorias, ordenarPorUso, registrarUsoCategoria } from '@/lib/preferencias';
import { useSession } from '@/providers/SessionProvider';
import { useUbicacion } from '@/providers/UbicacionProvider';
import { contactarPorWhatsApp } from '@/lib/whatsapp';

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
  // El título se coloca dentro de un perímetro con tres medidas que fija el
  // admin (Panel Admin → Título de la app): centro horizontal, ancho y centro
  // vertical. Ver src/lib/marca.ts.
  //
  // El perímetro va del borde FÍSICO de arriba —como lo midió el cliente en
  // su plantilla— hasta donde empieza el banner: 340 de 1000 del alto. Su
  // ancho es el del banner, para que el título se alinee con él.
  const { url: urlTitulo, centroX, ancho: anchoTitulo, alto: altoTitulo, centroY } = useMarca();
  // Una unidad de la rejilla del cliente = el ancho de la pantalla entre 1000.
  // Las medidas verticales usan la misma unidad que las horizontales, que es
  // lo que mantiene el bloque proporcionado en cualquier teléfono.
  const unidad = Dimensions.get('window').width / 1000;
  const altoPerimetro = Math.round(PERIMETRO_ALTO * unidad);

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
  /** Foto que se está viendo completa desde una tarjeta, si hay alguna. */
  const [fotoAbierta, setFotoAbierta] = useState<string | null>(null);

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
    fetchBanners(comunaId)
      .then(setBanners)
      .catch(() => {
        // Si falla, se queda con los que ya tenía: no vale la pena un error visible.
      });
    // Depende de la comuna: los banners de una comuna solo salen en la suya.
  }, [comunaId]);
  useFocusEffect(recargarBanners);

  // Categorías: igual que los banners, se vuelven a pedir cada vez que se
  // regresa a Inicio. La pestaña queda montada todo el tiempo y mientras
  // tanto el admin puede crear o eliminar una categoría; si se pidieran una
  // sola vez, la eliminada seguiría apareciendo en el catálogo hasta cerrar
  // la app. El orden que ya se está mostrando se conserva —reordenar en vivo
  // movería un chip justo debajo del dedo—: las nuevas entran al final y las
  // eliminadas simplemente desaparecen.
  const ordenMostrado = useRef<string[] | null>(null);
  /** Mientras el usuario no toque ninguna, manda la selección automática. */
  const sinElegir = useRef(true);
  const recargarCategorias = useCallback(() => {
    // Sin cuenta, las categorías sin ningún comercio no se muestran: solo
    // llevan a un catálogo vacío. Con cuenta se ven todas — el comerciante
    // necesita saber dónde puede publicar y el admin, qué hay montado.
    Promise.all([fetchCategorias(comunaId), leerUsoCategorias(), fetchCategoriasConContenido(comunaId)])
      .then(([todas, uso, conContenido]) => {
        const conComercios = todas.filter((c) => conContenido.has(c.id));
        const categoriasData = session ? todas : conComercios;
        setComunaVacia(conComercios.length === 0);
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
        setCategoriasVisibles(todas.map((c) => c.id));
        setCategorias(ordenadas);
        // Al abrir, la app entra directamente en la primera categoría
        // (documento EDIT APP). Si el filtro activo era una categoría que ya
        // no está, se vuelve a la primera en vez de quedar en un catálogo
        // vacío para siempre.
        setCategoriaId((actual) => {
          if (actual && ordenadas.some((c) => c.id === actual)) return actual;
          if (sinElegir.current && ordenadas.length > 0) {
            sinElegir.current = false;
            return ordenadas[0].id;
          }
          return actual && !ordenadas.some((c) => c.id === actual) ? (ordenadas[0]?.id ?? null) : actual;
        });
      })
      .catch(() => {
        // Se queda con las que ya tenía; un catálogo sin chips no es un error
        // que valga la pena mostrarle al usuario.
      });
    // `session`: al entrar o salir de la cuenta cambia qué categorías se ven.
  }, [comunaId, session]);
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
    sinElegir.current = true;
    setCategoriasVisibles(null);
    setCategoriaId(null);
    recargarCategorias();
    recargarBanners();
  }, [comunaId, recargarCategorias, recargarBanners]);

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
  // Ids de las categorías que esta comuna muestra. Filtran el catálogo, así
  // que es estado y no una ref: cuando llegan, las publicaciones se vuelven a
  // pedir ya filtradas. `null` = todavía no se sabe.
  const [categoriasVisibles, setCategoriasVisibles] = useState<string[] | null>(null);
  /** Ninguna categoría de esta comuna tiene comercios todavía. */
  const [comunaVacia, setComunaVacia] = useState(false);

  const loadPublicaciones = useCallback(
    async ({ isRefresh = false }: { isRefresh?: boolean } = {}) => {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        // Solo lo que cuelga de una categoría visible en esta comuna.
        const data = await fetchPublicaciones({
          categoriaId,
          comunaId,
          categoriasVisibles,
        });
        // Dentro de una categoría, al azar; en "Todas", agrupadas por el
        // orden de categorías del admin. Ver ordenCatalogo.ts.
        // `categoriasVisibles` viene de la consulta, así que trae el orden
        // del admin; `ordenMostrado` tiene las favoritas de esta persona
        // adelantadas, que es una preferencia de la fila de arriba, no del
        // catálogo.
        const ordenadas = ordenarCatalogo(data, categoriasVisibles ?? [], categoriaId);
        publicacionesRef.current = ordenadas;
        setPublicaciones(ordenadas);
      } catch (err) {
        setError(getErrorMessage(err, 'Error desconocido.'));
      } finally {
        isRefresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [categoriaId, comunaId, categoriasVisibles],
  );

  useEffect(() => {
    loadPublicaciones();
  }, [loadPublicaciones]);

  // Al volver a Inicio se vuelven a pedir: mientras la pestaña estaba
  // montada pudo aparecer una publicación nueva (recién aprobada, por
  // ejemplo) y antes no se veía hasta cambiar de filtro o de comuna.
  const primerFoco = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primerFoco.current) {
        primerFoco.current = false;
        return;
      }
      loadPublicaciones();
    }, [loadPublicaciones]),
  );

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
    sinElegir.current = false;
    registrarUsoCategoria(id);
    setCategoriaId(id);
  }, []);

  // Desde la tarjeta se puede contactar sin entrar a la publicación
  // (documento EDIT APP). El clic se registra igual: es la misma métrica.
  const handleContactar = useCallback((publicacion: PublicacionResumen) => {
    registrarUsoCategoria(publicacion.categoria_id);
    contactarPorWhatsApp(publicacion.id, publicacion.telefono, publicacion.titulo);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: PublicacionResumen }) => (
      <PublicacionCard
        publicacion={item}
        onPress={handleOpenPublicacion}
        onContactar={handleContactar}
        onVerFoto={setFotoAbierta}
      />
    ),
    [handleOpenPublicacion, handleContactar],
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
        {/* El perímetro del título. Su alto se descuenta del espacio que ya
            ocupa la barra de estado, porque el `SafeAreaView` la reserva
            aparte y si no el título quedaría más abajo de lo configurado.

            Sin sesión el título es además el acceso a la cuenta: no hay barra
            inferior que lleve a "Perfil". Con sesión no hace falta, porque la
            barra ya está ahí. */}
        <View style={[styles.perimetroTitulo, { height: Math.max(0, altoPerimetro - insets.top) }]}>
          <TituloPosicionado
            unidad={unidad}
            altoPerimetro={PERIMETRO_ALTO}
            recorteArriba={insets.top}
            medidas={{ centroX, ancho: anchoTitulo, alto: altoTitulo, centroY }}
            url={urlTitulo}
            debajo={<ComunaPicker comunas={comunas} selectedId={comunaId} onSelect={elegirComuna} />}
          />
          {/* Sin sesión, el LOGO es el acceso a la cuenta —no hay barra
              inferior que lleve a "Perfil"—, pero solo el logo: antes este
              toque cubría todo el perímetro y se comía el de la comuna, así
              que no se podía cambiar de comuna sin iniciar sesión. */}
          {!session && (
            <Pressable
              style={[styles.zonaLogo, { height: Math.max(0, Math.round(centroY * unidad + (altoTitulo * unidad) / 2) - insets.top) }]}
              onPress={() => router.push('/(auth)/login')}
              accessibilityRole="button"
              accessibilityLabel="Iniciar sesión o crear cuenta"
            />
          )}
        </View>

        {/* La key cambia si cambia la lista: el carrusel parte de cero en vez
            de quedar apuntando a un banner que ya no existe. */}
        <BannerCarousel key={banners.map((b) => b.id).join(',')} banners={banners} />
        {/* La fila solo desaparece para quien mira sin cuenta y no hay nada
            que filtrar; con cuenta se ven todas las categorías. */}
        {(session || !comunaVacia) && (
          <CategoryChips categorias={categorias} selectedId={categoriaId} onSelect={handleSeleccionarCategoria} />
        )}
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
              comunaVacia ? (
                <EmptyState
                  title="Todavía no hay comercios en esta comuna"
                  message="Nadie ha publicado por acá todavía. Prueba con otra comuna mientras tanto."
                />
              ) : (
                <EmptyState title="No encontramos comercios" message="Prueba con otra categoría o cambia de comuna." />
              )
            }
          />
        )}
      </View>

      {/* La foto de un producto, a pantalla completa, sin salir del inicio. */}
      <ImageViewer
        images={fotoAbierta ? [fotoAbierta] : []}
        visible={fotoAbierta !== null}
        initialIndex={0}
        onClose={() => setFotoAbierta(null)}
      />
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
  // Solo la franja del logo, hasta donde termina la imagen: debajo va el
  // nombre de la comuna, que tiene su propio toque.
  zonaLogo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  perimetroTitulo: {
    // El rectángulo donde el admin coloca el título: todo el ancho de la
    // pantalla y el alto del perímetro. El contenido va posicionado dentro
    // (ver TituloPosicionado), no apilado. Los márgenes laterales del
    // catálogo se anulan acá porque las medidas del título se cuentan desde
    // el borde de la pantalla, no desde el borde del contenido.
    alignSelf: 'stretch',
    marginHorizontal: -Layout.catalogMargin,
    // Red de seguridad: aunque llegara una medida imposible desde la base, el
    // título no puede dibujarse fuera de su perímetro ni pisar el banner.
    overflow: 'hidden',
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
