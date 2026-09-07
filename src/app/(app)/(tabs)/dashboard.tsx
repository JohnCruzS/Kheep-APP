import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BannerCarousel } from '@/components/catalog/BannerCarousel';
import { EmptyState, ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { CategoryChips } from '@/components/catalog/CategoryChips';
import { ComunaPicker } from '@/components/catalog/ComunaPicker';
import { PublicacionCard } from '@/components/catalog/PublicacionCard';
import { SearchBar } from '@/components/catalog/SearchBar';
import { Colors, Spacing } from '@/constants/theme';
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

const SEARCH_DEBOUNCE_MS = 350;

export default function DashboardScreen() {
  const router = useRouter();

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

  // `query` es lo que el usuario escribe letra a letra; `debouncedQuery` es
  // lo que realmente dispara la búsqueda, 350ms después de que deja de
  // teclear — sin este paso, "buscador en tiempo real" era una consulta a
  // Supabase por cada tecla.
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  // Vitrina: se carga una sola vez al montar la pantalla.
  useEffect(() => {
    Promise.all([fetchBanners(), fetchCategorias(), fetchComunas()])
      .then(([bannersData, categoriasData, comunasData]) => {
        setBanners(bannersData);
        setCategorias(categoriasData);
        setComunas(comunasData);
      })
      .catch((err) => setError(getErrorMessage(err, 'Error desconocido.')));
  }, []);

  // Publicaciones: se cargan de nuevo cada vez (y solo) que cambia un
  // filtro real — categoría, comuna o la búsqueda ya "asentada".
  const loadPublicaciones = useCallback(
    async ({ isRefresh = false }: { isRefresh?: boolean } = {}) => {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const data = await fetchPublicaciones({ categoriaId, comunaId, query: debouncedQuery });
        setPublicaciones(data);
      } catch (err) {
        setError(getErrorMessage(err, 'Error desconocido.'));
      } finally {
        isRefresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [categoriaId, comunaId, debouncedQuery],
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
            <View style={styles.header}>
              <Text style={styles.logo}>
                <Text style={styles.logoAccent}>Kh</Text>eep
              </Text>
              <ComunaPicker comunas={comunas} selectedId={comunaId} onSelect={setComunaId} />
            </View>

            <View style={styles.section}>
              <SearchBar value={query} onChangeText={setQuery} />
            </View>
            <BannerCarousel banners={banners} />
            <CategoryChips categorias={categorias} selectedId={categoriaId} onSelect={setCategoriaId} />

            {loading && <LoadingState />}
            {error && <ErrorState message={error} onRetry={() => loadPublicaciones()} />}
          </View>
        }
        ListEmptyComponent={
          !loading && !error ? (
            <EmptyState
              title="No encontramos comercios"
              message="Prueba con otra categoría, otra comuna o busca con otra palabra."
            />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function ItemSeparator() {
  return <View style={{ height: Spacing.two }} />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.five,
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
  },
  logo: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  logoAccent: {
    color: Colors.accent,
  },
  section: {
    marginBottom: 2,
  },
});
