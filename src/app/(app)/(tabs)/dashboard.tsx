import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  fetchComuna,
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
const ESPACIO_CATEGORIAS_TARJETA = 24;

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

  /** Todo el catálogo de la comuna, tal como vino de la base. */
  const [deLaComuna, setDeLaComuna] = useState<PublicacionResumen[]>([]);
  /** Nombre de la comuna actual: llega solo, antes que la lista completa. */
  const [nombreComuna, setNombreComuna] = useState<string | null>(null);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  // La comuna no es estado de esta pantalla: se resolvió antes de entrar (en
  // la bienvenida) y queda guardada en el teléfono, así que al volver a abrir
  // la app el catálogo ya arranca en la comuna del usuario.
  const { comunaId, elegirComuna, avisarCatalogoListo } = useUbicacion();

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
        setCategoriasListas(true);
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
        setCategoriasListas(true);
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
    setCategoriasListas(false);
    recargarCategorias();
    recargarBanners();
  }, [comunaId, recargarCategorias, recargarBanners]);

  // El encabezado solo necesita el NOMBRE de la comuna: una fila. La lista
  // completa (las ~350 del selector) se pide después y no retrasa el arranque.
  useEffect(() => {
    if (!comunaId) {
      setNombreComuna(null);
      return;
    }
    let vivo = true;
    fetchComuna(comunaId)
      .then((comuna) => {
        if (vivo) setNombreComuna(comuna?.nombre ?? null);
      })
      .catch(() => {
        // Sin nombre se sigue igual: el catálogo es lo que importa.
      });
    return () => {
      vivo = false;
    };
  }, [comunaId]);

  // La lista completa, en segundo plano: es para cuando se abra el selector.
  useEffect(() => {
    fetchComunas()
      .then(setComunas)
      .catch(() => {
        // El selector se queda vacío; no es motivo para tapar el catálogo con
        // un error.
      });
  }, []);

  // Publicaciones: se cargan de nuevo cada vez (y solo) que cambia un
  // filtro real — categoría, comuna o la búsqueda ya "asentada".
  // Ids de las categorías que esta comuna muestra. Filtran el catálogo, así
  // que es estado y no una ref: cuando llegan, las publicaciones se vuelven a
  // pedir ya filtradas. `null` = todavía no se sabe.
  const [categoriasVisibles, setCategoriasVisibles] = useState<string[] | null>(null);
  /** Ninguna categoría de esta comuna tiene comercios todavía. */
  const [comunaVacia, setComunaVacia] = useState(false);
  /** Ya se resolvió la fila de categorías, aunque haya quedado vacía. */
  const [categoriasListas, setCategoriasListas] = useState(false);

  // Se pide TODO el catálogo de la comuna de una vez, sin esperar a saber qué
  // categorías tiene: así esta consulta viaja en paralelo con la de las
  // categorías en vez de ir detrás (el arranque se acortaba a la mitad). De
  // paso, cambiar de categoría ya no pide nada a la red: se filtra acá mismo
  // y es instantáneo.
  const loadPublicaciones = useCallback(
    async ({ isRefresh = false }: { isRefresh?: boolean } = {}) => {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        setDeLaComuna(await fetchPublicaciones({ comunaId }));
      } catch (err) {
        setError(getErrorMessage(err, 'Error desconocido.'));
      } finally {
        isRefresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [comunaId],
  );

  useEffect(() => {
    loadPublicaciones();
  }, [loadPublicaciones]);

  // Lo que se muestra: la categoría elegida o, en "Todas", solo lo que cuelga
  // de una categoría visible en esta comuna. Dentro de una categoría va al
  // azar y en "Todas" agrupado por el orden del admin (ver ordenCatalogo.ts);
  // el orden se recalcula solo cuando cambia algo de verdad, no en cada
  // dibujado, para que las tarjetas no salten solas.
  const publicaciones = useMemo(() => {
    const visibles = categoriaId
      ? deLaComuna.filter((p) => p.categoria_id === categoriaId)
      : categoriasVisibles
        ? deLaComuna.filter((p) => p.categoria_id && categoriasVisibles.includes(p.categoria_id))
        : deLaComuna;
    return ordenarCatalogo(visibles, categoriasVisibles ?? [], categoriaId);
  }, [deLaComuna, categoriaId, categoriasVisibles]);

  useEffect(() => {
    publicacionesRef.current = publicaciones;
  }, [publicaciones]);

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

  // Con el nombre de la comuna, la fila de categorías y la primera tanda de
  // comercios ya en pantalla, se puede quitar el arranque. Si algo falló, se
  // quita igual: el error se muestra dentro del catálogo y nadie se queda
  // mirando el negro.
  const listoParaMostrar =
    !!error ||
    ((!comunaId || !!nombreComuna) &&
      categoriasListas &&
      !loading &&
      // Y con las tarjetas ya en la mano: si no, se alcanzaba a ver el inicio
      // con el hueco gris y la ruedita. Una comuna sin comercios, o sin
      // categorías, no tiene nada que esperar.
      (publicaciones.length > 0 || comunaVacia || categorias.length === 0));
  useEffect(() => {
    if (listoParaMostrar) avisarCatalogoListo();
  }, [listoParaMostrar, avisarCatalogoListo]);

  // Tope de seguridad: pase lo que pase, la app se muestra. Sin esto, una
  // consulta que nunca responde dejaría al usuario mirando el negro.
  useEffect(() => {
    const id = setTimeout(avisarCatalogoListo, 8000);
    return () => clearTimeout(id);
  }, [avisarCatalogoListo]);

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
            debajo={
              <ComunaPicker comunas={comunas} selectedId={comunaId} onSelect={elegirComuna} nombre={nombreComuna} />
            }
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
                  sobreClaro
                  title="Todavía no hay comercios en esta comuna"
                  message="Nadie ha publicado por acá todavía. Prueba con otra comuna mientras tanto."
                />
              ) : (
                <EmptyState sobreClaro title="No encontramos comercios" message="Prueba con otra categoría o cambia de comuna." />
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
