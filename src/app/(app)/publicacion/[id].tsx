import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { PublicacionDetalle, fetchPublicacionDetalle } from '@/lib/catalog';
import { contactarPorWhatsApp } from '@/lib/whatsapp';

export default function PublicacionDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [publicacion, setPublicacion] = useState<PublicacionDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contacting, setContacting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPublicacionDetalle(id);
      setPublicacion(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleContact = async () => {
    if (!publicacion) return;
    setContacting(true);
    try {
      await contactarPorWhatsApp(publicacion.id, publicacion.telefono, publicacion.titulo);
    } finally {
      setContacting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
          <Text style={styles.backLabel}>‹ Volver</Text>
        </Pressable>
      </View>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && !publicacion && (
        <EmptyState title="No encontramos esta publicación" message="Puede que haya sido retirada por su dueño." />
      )}

      {!loading && !error && publicacion && (
        <ScrollView contentContainerStyle={styles.content}>
          {publicacion.logo_url ? (
            <Image source={{ uri: publicacion.logo_url }} style={styles.hero} contentFit="cover" />
          ) : (
            <View style={[styles.hero, styles.heroFallback]} />
          )}

          <View style={styles.body}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{publicacion.titulo}</Text>
              {publicacion.destacado && <Text style={styles.destacado}>★ Destacado</Text>}
            </View>

            <Text style={styles.subtitle}>
              {[publicacion.categoria?.nombre, publicacion.comuna?.nombre].filter(Boolean).join(' · ')}
            </Text>

            {publicacion.descripcion && <Text style={styles.description}>{publicacion.descripcion}</Text>}

            {publicacion.productos.length > 0 && (
              <View style={styles.productsSection}>
                <Text style={styles.sectionLabel}>PRODUCTOS</Text>
                <View style={styles.productList}>
                  {publicacion.productos.map((producto) => (
                    <View key={producto.id} style={styles.productCard}>
                      {producto.imagen_url ? (
                        <Image source={{ uri: producto.imagen_url }} style={styles.productImage} contentFit="cover" />
                      ) : (
                        <View style={[styles.productImage, styles.productImageFallback]} />
                      )}
                      <Text style={styles.productName} numberOfLines={1}>
                        {producto.nombre}
                      </Text>
                      <Text style={styles.productPrice}>${producto.precio.toLocaleString('es-CL')}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {!loading && !error && publicacion && (
        <View style={styles.ctaBar}>
          <Pressable
            onPress={handleContact}
            disabled={contacting}
            style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaPressed]}>
            <Text style={styles.ctaLabel}>{contacting ? 'Abriendo WhatsApp…' : 'Contactar por WhatsApp'}</Text>
          </Pressable>
        </View>
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
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  backLabel: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  content: {
    paddingBottom: 120,
  },
  hero: {
    width: '100%',
    height: 220,
  },
  heroFallback: {
    backgroundColor: Colors.surface,
  },
  body: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  title: {
    flexShrink: 1,
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
  },
  destacado: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.accent,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    color: Colors.text,
    marginTop: Spacing.two,
  },
  productsSection: {
    marginTop: Spacing.four,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: Colors.textMuted,
    marginBottom: Spacing.two,
  },
  productList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  productCard: {
    width: '31%',
  },
  productImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radius.card - 12,
    marginBottom: 6,
  },
  productImageFallback: {
    backgroundColor: Colors.surface,
  },
  productName: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
  },
  productPrice: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 1,
  },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.three,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  ctaButton: {
    height: 52,
    borderRadius: Radius.button,
    backgroundColor: Colors.whatsapp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: {
    opacity: 0.85,
  },
  ctaLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
