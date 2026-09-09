import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BannerCarousel } from '@/components/catalog/BannerCarousel';
import { EmptyState, ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { CategoryChips } from '@/components/catalog/CategoryChips';
import { ComunaPicker } from '@/components/catalog/ComunaPicker';
import { PublicacionCard } from '@/components/catalog/PublicacionCard';
import { Colors, Fonts, Spacing } from '@/constants/theme';
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
import { detectarComunaActual } from '@/lib/location';
import { useSession } from '@/providers/SessionProvider';

export default function DashboardScreen() {
  const router = useRouter();
  const { session } = useSession();

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
  const [comunaId, setComunaId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si el usuario ya tocó el selector de comuna con su propio dedo, la
  // detección automática por GPS (que puede tardar unos segundos en
  // resolver) no debe pisarle la elección cuando llegue.
  const comunaElegidaAMano = useRef(false);

  // Vitrina: se carga una sola vez al montar la pantalla.
  useEffect(() => {
    Promise.all([fetchBanners(), fetchCategorias(), fetchComunas()])
      .then(([bannersData, categoriasData, comunasData]) => {
        setBanners(bannersData);
        setCategorias(categoriasData);
        setComunas(comunasData);

        // Identificar la zona del usuario es "mejor esfuerzo": si no da
        // permiso de ubicación, o su comuna no calza con la lista, el
        // catálogo se queda tal cual (con "Todas las comunas"), nunca
        // bloquea ni muestra error.
        detectarComunaActual(comunasData).then((detectadaId) => {
          if (detectadaId && !comunaElegidaAMano.current) {
            setComunaId(detectadaId);
          }
        });
      })
      .catch((err) => setError(getErrorMessage(err, 'Error desconocido.')));
  }, []);

  const handleSeleccionarComuna = useCallback((id: string | null) => {
    comunaElegidaAMano.current = true;
    setComunaId(id);
  }, []);

  // Publicaciones: se cargan de nuevo cada vez (y solo) que cambia un
  // filtro real — categoría, comuna o la búsqueda ya "asentada".
  const loadPublicaciones = useCallback(
    async ({ isRefresh = false }: { isRefresh?: boolean } = {}) => {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const data = await fetchPublicaciones({ categoriaId, comunaId });
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

  const handleOpenPublicacion = useCallback(
    (id: string) => router.push({ pathname: '/(app)/publicacion/[id]', params: { id } }),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: PublicacionResumen }) => <PublicacionCard publicacion={item} onPress={handleOpenPublicacion} />,
    [handleOpenPublicacion],
  );

  const keyExtractor = useCallback((item: PublicacionResumen) => item.id, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <FlatList
        style={styles.list}
        data={loading || error ? [] : publicaciones}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        onRefresh={() => loadPublicaciones({ isRefresh: true })}
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
        ListHeaderComponent={
          <View>
            <View style={styles.blackHeader}>
              <View style={styles.header}>
                {/* Sin sesión el logo es el acceso a la cuenta: no hay barra
                    inferior que lleve a "Perfil". Con sesión no hace falta,
                    porque la barra ya está ahí. */}
                {session ? (
                  <Text style={styles.logo}>
                    <Text style={styles.logoAccent}>Kh</Text>eep
                  </Text>
                ) : (
                  <Pressable
                    onPress={() => router.push('/(auth)/login')}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Iniciar sesión o crear cuenta">
                    <Text style={styles.logo}>
                      <Text style={styles.logoAccent}>Kh</Text>eep
                    </Text>
                  </Pressable>
                )}
                <ComunaPicker comunas={comunas} selectedId={comunaId} onSelect={handleSeleccionarComuna} />
              </View>

              <BannerCarousel banners={banners} />
              <CategoryChips categorias={categorias} selectedId={categoriaId} onSelect={setCategoriaId} />
            </View>

            {loading && <LoadingState />}
            {error && <ErrorState message={error} onRetry={() => loadPublicaciones()} />}
          </View>
        }
        ListEmptyComponent={
          !loading && !error ? (
            <EmptyState
              title="No encontramos comercios"
              message="Prueba con otra categoría o cambia de comuna."
            />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function ItemSeparator() {
  return <View style={{ height: Spacing.three }} />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  list: {
    flex: 1,
    // Gris muy claro, no blanco puro: si fuera el mismo blanco que el panel
    // del icono de cada tarjeta, la tarjeta se perdería contra el fondo.
    backgroundColor: Colors.backgroundSoft,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.five,
  },
  // Todo lo de arriba (logo, buscador, banner, categorías) va sobre negro;
  // debajo de las categorías el fondo pasa a blanco, con las tarjetas
  // flotando encima (pedido del cliente). El margen negativo hace que el
  // negro llegue de borde a borde aunque `listContent` le ponga relleno
  // horizontal a todo lo demás.
  blackHeader: {
    backgroundColor: Colors.background,
    marginHorizontal: -Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing.five,
    paddingBottom: Spacing.three,
    gap: 4,
  },
  logo: {
    fontFamily: Fonts.extraBold,
    fontSize: 34,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  logoAccent: {
    color: Colors.accent,
  },
});
