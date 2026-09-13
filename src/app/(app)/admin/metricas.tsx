import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { MetricaPublicacion, fetchMetricas } from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';

export default function MetricasScreen() {
  const router = useRouter();

  const [metricas, setMetricas] = useState<MetricaPublicacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMetricas(await fetchMetricas());
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalClics = metricas.reduce((sum, m) => sum + m.total_clics_whatsapp, 0);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backLabel}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.topTitle}>Métricas</Text>
        <View style={{ width: 70 }} />
      </View>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && metricas.length === 0 && (
        <EmptyState title="Todavía sin datos" message="Cuando alguien contacte a un comercio por WhatsApp, aparece acá." />
      )}

      {!loading && !error && metricas.length > 0 && (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>CLICS TOTALES A WHATSAPP</Text>
            <Text style={styles.totalValor}>{totalClics.toLocaleString('es-CL')}</Text>
          </View>

          <Text style={styles.sectionLabel}>POR PUBLICACIÓN</Text>
          {metricas.map((metrica, index) => (
            <View key={metrica.publicacion_id} style={styles.row}>
              <Text style={styles.rank}>{index + 1}</Text>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitulo} numberOfLines={1}>
                  {metrica.titulo}
                </Text>
                <Text style={styles.rowSub}>
                  {metrica.dias_con_actividad} {metrica.dias_con_actividad === 1 ? 'día' : 'días'} con actividad
                </Text>
              </View>
              <Text style={styles.rowClics}>{metrica.total_clics_whatsapp}</Text>
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
  totalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.four,
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  totalLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: Colors.textMuted,
    marginBottom: Spacing.two,
  },
  totalValor: {
    fontFamily: Fonts.bold,
    fontSize: 34,
    color: Colors.success,
  },
  sectionLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: Colors.textMuted,
    marginBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  rank: {
    fontFamily: Fonts.semiBold,
    width: 20,
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  rowInfo: {
    flex: 1,
  },
  rowTitulo: {
    fontFamily: Fonts.medium,
    fontSize: 14.5,
    color: Colors.text,
  },
  rowSub: {
    fontFamily: Fonts.light,
    fontSize: 11.5,
    color: Colors.textMuted,
    marginTop: 1,
  },
  rowClics: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: Colors.success,
  },
});
