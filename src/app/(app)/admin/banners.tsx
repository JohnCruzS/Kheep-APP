import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { BannerAdmin, eliminarBanner, fetchBannersActivosAdmin } from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';

/** DD/MM/AAAA, el mismo formato que el resto de la app. */
function fecha(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Banners que hoy se ven en el carrusel del catálogo, con opción de
 * eliminarlos (por ejemplo, uno con contenido inapropiado).
 */
export default function BannersAdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [banners, setBanners] = useState<BannerAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBanners(await fetchBannersActivosAdmin());
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleEliminar(banner: BannerAdmin) {
    const deQuien = banner.autor?.nombre ? ` de ${banner.autor.nombre}` : '';
    Alert.alert(
      'Eliminar banner',
      `¿Eliminar este banner${deQuien}? Deja de mostrarse en la app de inmediato y no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setEliminando(banner.id);
            try {
              await eliminarBanner(banner.id);
              setBanners((list) => list.filter((b) => b.id !== banner.id));
            } catch (err) {
              setError(getErrorMessage(err, 'No se pudo eliminar el banner.'));
            } finally {
              setEliminando(null);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backLabel}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.topTitle}>Banners activos</Text>
        <View style={{ width: 70 }} />
      </View>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && banners.length === 0 && (
        <EmptyState title="No hay banners activos" message="Cuando haya banners mostrándose en la app, aparecerán acá." />
      )}

      {!loading && !error && banners.length > 0 && (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Spacing.six + insets.bottom }]}>
          <Text style={styles.ayuda}>
            {banners.length === 1 ? 'Este banner se está' : `Estos ${banners.length} banners se están`} mostrando hoy en
            el carrusel del catálogo.
          </Text>

          {banners.map((banner) => (
            <View key={banner.id} style={styles.card}>
              <Image source={{ uri: banner.imagen_url }} style={styles.imagen} contentFit="cover" />
              <View style={styles.info}>
                <View style={styles.infoTexto}>
                  <Text style={styles.autor} numberOfLines={1}>
                    {banner.autor?.nombre ?? 'Banner del sistema'}
                  </Text>
                  <Text style={styles.detalle} numberOfLines={1}>
                    {banner.comuna?.nombre ?? 'Todas las comunas'}
                  </Text>
                  <Text style={styles.detalle} numberOfLines={1}>
                    {banner.fecha_fin ? `Hasta el ${fecha(banner.fecha_fin)}` : 'Sin fecha de término'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleEliminar(banner)}
                  disabled={eliminando === banner.id}
                  style={({ pressed }) => [styles.eliminarBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Eliminar banner">
                  <Text style={styles.eliminarLabel}>{eliminando === banner.id ? 'Eliminando…' : 'Eliminar'}</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  backLabel: {
    fontFamily: Fonts.medium,
    color: Colors.text,
    fontSize: 15,
    width: 70,
  },
  topTitle: {
    fontFamily: Fonts.semiBold,
    color: Colors.text,
    fontSize: 15,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
  },
  ayuda: {
    fontFamily: Fonts.light,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textMuted,
    marginBottom: Spacing.three,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
    marginBottom: Spacing.three,
  },
  imagen: {
    width: '100%',
    height: 150,
    backgroundColor: Colors.backgroundAlt,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  infoTexto: {
    flex: 1,
  },
  autor: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.text,
  },
  detalle: {
    fontFamily: Fonts.light,
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  eliminarBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 10,
    backgroundColor: 'rgba(217,8,4,0.15)',
  },
  pressed: {
    opacity: 0.7,
  },
  eliminarLabel: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: Colors.danger,
  },
});
