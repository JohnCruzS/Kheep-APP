import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BannerCarousel } from '@/components/catalog/BannerCarousel';
import { EmptyState, ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { CategoryChips } from '@/components/catalog/CategoryChips';
import { PublicacionCard } from '@/components/catalog/PublicacionCard';
import { SearchBar } from '@/components/catalog/SearchBar';
import { Colors, Spacing } from '@/constants/theme';
import {
  Banner,
  Categoria,
  PublicacionResumen,
  fetchBanners,
  fetchCategorias,
  fetchPublicaciones,
} from '@/lib/catalog';

export default function DashboardScreen() {
  const router = useRouter();

  const [banners, setBanners] = useState<Banner[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [publicaciones, setPublicaciones] = useState<PublicacionResumen[]>([]);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async ({ isRefresh = false }: { isRefresh?: boolean } = {}) => {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const [bannersData, categoriasData, publicacionesData] = await Promise.all([
          fetchBanners(),
          fetchCategorias(),
          fetchPublicaciones({ categoriaId, query }),
        ]);
        setBanners(bannersData);
        setCategorias(categoriasData);
        setPublicaciones(publicacionesData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido.');
      } finally {
        isRefresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [categoriaId, query],
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <FlatList
        style={styles.list}
        data={loading || error ? [] : publicaciones}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        onRefresh={() => load({ isRefresh: true })}
        refreshing={refreshing}
        renderItem={({ item }) => (
          <PublicacionCard
            publicacion={item}
            onPress={() => router.push({ pathname: '/(app)/publicacion/[id]', params: { id: item.id } })}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <Text style={styles.logo}>
                <Text style={styles.logoAccent}>Kh</Text>eep
              </Text>
              {/* Filtro de comuna real llega con el selector geográfico —
                  por ahora Santiago es la comuna por defecto del catálogo. */}
              <Text style={styles.comuna}>Santiago</Text>
            </View>

            <View style={styles.section}>
              <SearchBar value={query} onChangeText={setQuery} />
            </View>
            <BannerCarousel banners={banners} />
            <CategoryChips categorias={categorias} selectedId={categoriaId} onSelect={setCategoriaId} />

            {loading && <LoadingState />}
            {error && <ErrorState message={error} onRetry={() => load()} />}
          </View>
        }
        ListEmptyComponent={
          !loading && !error ? (
            <EmptyState
              title="No encontramos comercios"
              message="Prueba con otra categoría o busca con otra palabra."
            />
          ) : null
        }
      />
    </SafeAreaView>
  );
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
  comuna: {
    marginTop: 2,
    fontSize: 13,
    color: Colors.textMuted,
  },
  section: {
    marginBottom: 2,
  },
});
