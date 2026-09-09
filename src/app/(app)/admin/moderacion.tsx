import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { Colors, Spacing } from '@/constants/theme';
import { PublicacionPendiente, aprobarPublicacion, fetchPublicacionesPendientes, rechazarPublicacion } from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';

export default function ModeracionScreen() {
  const router = useRouter();

  const [pendientes, setPendientes] = useState<PublicacionPendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPendientes(await fetchPublicacionesPendientes());
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAprobar(id: string) {
    setProcesando(id);
    try {
      await aprobarPublicacion(id);
      setPendientes((list) => list.filter((p) => p.id !== id));
    } catch (err) {
      Alert.alert('No se pudo aprobar', getErrorMessage(err, 'Intenta de nuevo.'));
    } finally {
      setProcesando(null);
    }
  }

  function handleRechazar(id: string, titulo: string) {
    Alert.alert('Rechazar publicación', `¿Rechazar "${titulo}"? El comerciante va a ver que fue rechazada.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Rechazar',
        style: 'destructive',
        onPress: async () => {
          setProcesando(id);
          try {
            await rechazarPublicacion(id);
            setPendientes((list) => list.filter((p) => p.id !== id));
          } catch (err) {
            Alert.alert('No se pudo rechazar', getErrorMessage(err, 'Intenta de nuevo.'));
          } finally {
            setProcesando(null);
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backLabel}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.topTitle}>Moderación</Text>
        <View style={{ width: 70 }} />
      </View>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && pendientes.length === 0 && (
        <EmptyState title="Todo al día" message="No hay publicaciones esperando revisión." />
      )}

      {!loading && !error && pendientes.length > 0 && (
        <ScrollView contentContainerStyle={styles.content}>
          {pendientes.map((publicacion) => (
            <View key={publicacion.id} style={styles.card}>
              <View style={styles.cardHeader}>
                {publicacion.logo_url ? (
                  <Image source={{ uri: publicacion.logo_url }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]} />
                )}
                <View style={styles.cardHeaderInfo}>
                  <Text style={styles.titulo}>{publicacion.titulo}</Text>
                  <Text style={styles.subtitulo}>
                    {[publicacion.categoria?.nombre, publicacion.comuna?.nombre].filter(Boolean).join(' · ') || 'Sin datos'}
                  </Text>
                </View>
              </View>

              {publicacion.descripcion && <Text style={styles.descripcion}>{publicacion.descripcion}</Text>}

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>
                  {publicacion.autor?.nombre ?? 'Comerciante'} · Nivel {publicacion.autor?.nivel ?? '?'} ·{' '}
                  {publicacion.telefono}
                </Text>
              </View>

              <View style={styles.actionsRow}>
                <Pressable
                  disabled={procesando === publicacion.id}
                  onPress={() => handleRechazar(publicacion.id, publicacion.titulo)}
                  style={[styles.actionButton, styles.rechazarButton]}>
                  <Text style={styles.rechazarLabel}>Rechazar</Text>
                </Pressable>
                <Pressable
                  disabled={procesando === publicacion.id}
                  onPress={() => handleAprobar(publicacion.id)}
                  style={[styles.actionButton, styles.aprobarButton]}>
                  <Text style={styles.aprobarLabel}>
                    {procesando === publicacion.id ? 'Procesando…' : 'Aprobar'}
                  </Text>
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
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
    width: 70,
  },
  topTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: Spacing.two + 4,
    alignItems: 'center',
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  thumbEmpty: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cardHeaderInfo: {
    flex: 1,
  },
  titulo: {
    fontSize: 15.5,
    fontWeight: '700',
    color: Colors.text,
  },
  subtitulo: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  descripcion: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.text,
  },
  metaRow: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: Spacing.two,
  },
  metaLabel: {
    fontSize: 11.5,
    color: Colors.textMuted,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  actionButton: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rechazarButton: {
    backgroundColor: 'rgba(217,8,4,0.14)',
  },
  rechazarLabel: {
    color: Colors.danger,
    fontWeight: '700',
    fontSize: 13.5,
  },
  aprobarButton: {
    backgroundColor: Colors.success,
  },
  aprobarLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13.5,
  },
});
