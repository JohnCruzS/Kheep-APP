import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { ComunaAdmin, actualizarComunaActiva, fetchComunasAdmin } from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';

/**
 * Comunas es una lista FIJA — a diferencia de Categorías, acá un admin solo
 * activa/desactiva, nunca crea ni borra (pedido explícito del cliente).
 * Se agrupa por región con un desplegable, puramente para orden visual.
 */
export default function ComunasAdminScreen() {
  const router = useRouter();

  const [comunas, setComunas] = useState<ComunaAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openRegion, setOpenRegion] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchComunasAdmin();
      setComunas(data);
      setOpenRegion((current) => current ?? data[0]?.region ?? null);
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grupos = useMemo(() => {
    const map = new Map<string, ComunaAdmin[]>();
    for (const comuna of comunas) {
      const lista = map.get(comuna.region) ?? [];
      lista.push(comuna);
      map.set(comuna.region, lista);
    }
    return Array.from(map.entries());
  }, [comunas]);

  async function handleToggle(comuna: ComunaAdmin) {
    const nuevoValor = !comuna.activa;
    setComunas((list) => list.map((c) => (c.id === comuna.id ? { ...c, activa: nuevoValor } : c)));
    try {
      await actualizarComunaActiva(comuna.id, nuevoValor);
    } catch (err) {
      // revierte si falla
      setComunas((list) => list.map((c) => (c.id === comuna.id ? { ...c, activa: comuna.activa } : c)));
      setError(getErrorMessage(err, 'No se pudo actualizar la comuna.'));
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backLabel}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.topTitle}>Comunas</Text>
        <View style={{ width: 70 }} />
      </View>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && comunas.length === 0 && (
        <EmptyState title="No hay comunas" message="Todavía no se ha cargado ninguna comuna." />
      )}

      {!loading && !error && comunas.length > 0 && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.intro}>
            El interruptor muestra u oculta la comuna en el selector. Toca el nombre para entrar a su catálogo:
            qué categorías tiene, en qué orden, y los perfiles que publican en cada una.
          </Text>

          {grupos.map(([region, lista]) => {
            const isOpen = openRegion === region;
            const activas = lista.filter((c) => c.activa).length;
            return (
              <View key={region} style={styles.regionBlock}>
                <Pressable style={styles.regionHeader} onPress={() => setOpenRegion(isOpen ? null : region)}>
                  <View>
                    <Text style={styles.regionTitle}>{region}</Text>
                    <Text style={styles.regionSubtitle}>
                      {activas} de {lista.length} visibles
                    </Text>
                  </View>
                  <Text style={styles.chevron}>{isOpen ? '︿' : '﹀'}</Text>
                </Pressable>

                {isOpen && (
                  <View style={styles.comunaList}>
                    {lista.map((comuna) => (
                      <View key={comuna.id} style={styles.comunaRow}>
                        {/* El nombre entra al catálogo de esa comuna
                            (categorías y perfiles); el interruptor solo
                            decide si aparece en el selector de comunas. */}
                        <Pressable
                          style={styles.comunaNombreZona}
                          onPress={() => router.push({ pathname: '/(app)/admin/comuna/[id]', params: { id: comuna.id } })}>
                          <Text style={styles.comunaNombre}>{comuna.nombre}</Text>
                          <Text style={styles.comunaArrow}>›</Text>
                        </Pressable>
                        <Switch
                          value={comuna.activa}
                          onValueChange={() => handleToggle(comuna)}
                          trackColor={{ false: Colors.surfaceBorder, true: Colors.accent }}
                          thumbColor="#FFFFFF"
                        />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
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
  intro: {
    fontFamily: Fonts.light,
    fontSize: 12.5,
    lineHeight: 18,
    color: Colors.textMuted,
    marginBottom: Spacing.four,
  },
  regionBlock: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginBottom: Spacing.three,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  regionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
  },
  regionTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    color: Colors.text,
  },
  regionSubtitle: {
    fontFamily: Fonts.light,
    fontSize: 11.5,
    color: Colors.textMuted,
    marginTop: 2,
  },
  chevron: {
    fontFamily: Fonts.light,
    fontSize: 12,
    color: Colors.textMuted,
  },
  comunaList: {
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  comunaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  comunaNombreZona: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
    marginRight: Spacing.three,
  },
  comunaArrow: {
    fontFamily: Fonts.light,
    fontSize: 18,
    color: Colors.textMuted,
  },
  comunaNombre: {
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.text,
  },
});
