import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { ImageViewer } from '@/components/catalog/ImageViewer';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { PublicacionDetalle, fetchPublicacionDetalle } from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { contactarPorWhatsApp } from '@/lib/whatsapp';

export default function PublicacionDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  // La barra de 3 botones de Android se dibuja encima de la app: el botón
  // de WhatsApp (fijo abajo) debe quedar por sobre ella para poder tocarse.
  const insets = useSafeAreaInsets();

  const [publicacion, setPublicacion] = useState<PublicacionDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contacting, setContacting] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPublicacionDetalle(id);
      setPublicacion(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido.'));
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

  const galleryImages = publicacion
    ? [publicacion.logo_url, ...publicacion.productos.map((p) => p.imagen_url)].filter(
        (url): url is string => !!url,
      )
    : [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* El mismo encabezado que el resto de la app: el título arriba y,
          debajo, de qué comercio se trata. */}
      <EncabezadoMarca subtitulo={publicacion?.titulo ?? 'Comercio'} onVolver={() => router.back()} />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && !publicacion && (
        <EmptyState title="No encontramos esta publicación" message="Puede que haya sido retirada por su dueño." />
      )}

      {!loading && !error && publicacion && (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]}>
          {publicacion.logo_url ? (
            <Pressable onPress={() => setViewerIndex(0)}>
              <Image source={{ uri: publicacion.logo_url }} style={styles.hero} contentFit="cover" />
            </Pressable>
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
                        <Pressable onPress={() => setViewerIndex(galleryImages.indexOf(producto.imagen_url!))}>
                          <Image source={{ uri: producto.imagen_url }} style={styles.productImage} contentFit="cover" />
                        </Pressable>
                      ) : (
                        <View style={[styles.productImage, styles.productImageFallback]} />
                      )}
                      <Text style={styles.productName} numberOfLines={1}>
                        {producto.nombre}
                      </Text>
                      {producto.precio > 0 && (
                        <Text style={styles.productPrice}>${producto.precio.toLocaleString('es-CL')}</Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {!loading && !error && publicacion && (
        <View style={[styles.ctaBar, { paddingBottom: Spacing.three + insets.bottom }]}>
          <Pressable
            onPress={handleContact}
            disabled={contacting}
            style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaPressed]}>
            <Text style={styles.ctaLabel}>{contacting ? 'Abriendo WhatsApp…' : 'Contactar por WhatsApp'}</Text>
          </Pressable>
        </View>
      )}

      <ImageViewer
        images={galleryImages}
        visible={viewerIndex !== null}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
      />
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
    fontFamily: Fonts.medium,
    color: Colors.text,
    fontSize: 15,
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
    fontFamily: Fonts.bold,
    flexShrink: 1,
    fontSize: 22,
    color: Colors.text,
  },
  destacado: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: Colors.accent,
    marginTop: 4,
  },
  subtitle: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.textMuted,
  },
  description: {
    fontFamily: Fonts.light,
    fontSize: 14,
    lineHeight: 21,
    color: Colors.text,
    marginTop: Spacing.two,
  },
  productsSection: {
    marginTop: Spacing.four,
  },
  sectionLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
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
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: Colors.text,
  },
  productPrice: {
    fontFamily: Fonts.light,
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
    fontFamily: Fonts.semiBold,
    color: '#FFFFFF',
    fontSize: 15,
  },
});
