import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Interruptor } from '@/components/ui/Interruptor';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { ComunaAdmin, actualizarComunaActiva, fetchComunasAdmin } from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';

/**
 * Regiones y comunas del catálogo.
 *
 * Las regiones son solo el cajón que agrupa: no se ocultan ni se editan, se
 * abren para llegar a sus comunas. Lo que se administra es cada comuna — si se
 * ve o no en la app— y, entrando en ella, su catálogo de categorías.
 *
 * Las filas van juntas y sin adornos, en una sola tarjeta por región: con 346
 * comunas, una tarjeta por cada una obligaba a desplazarse eternamente.
 */
export default function ComunasAdminScreen() {
  const router = useRouter();
  const [comunas, setComunas] = useState<ComunaAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regionAbierta, setRegionAbierta] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setComunas(await fetchComunasAdmin());
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const regiones = useMemo(() => {
    const porRegion = new Map<string, ComunaAdmin[]>();
    for (const comuna of comunas) {
      const region = comuna.region ?? 'Sin región';
      const lista = porRegion.get(region);
      if (lista) lista.push(comuna);
      else porRegion.set(region, [comuna]);
    }
    return [...porRegion.entries()].sort(([a], [b]) => compararRegiones(a, b));
  }, [comunas]);

  async function handleToggle(comuna: ComunaAdmin) {
    const nuevo = !comuna.activa;
    setComunas((list) => list.map((c) => (c.id === comuna.id ? { ...c, activa: nuevo } : c)));
    try {
      await actualizarComunaActiva(comuna.id, nuevo);
    } catch (err) {
      setComunas((list) => list.map((c) => (c.id === comuna.id ? { ...c, activa: comuna.activa } : c)));
      setError(getErrorMessage(err, 'No se pudo actualizar la comuna.'));
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      <EncabezadoMarca subtitulo="Chile" onVolver={() => router.back()} />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {regiones.map(([region, lista]) => {
            const abierta = regionAbierta === region;
            const visibles = lista.filter((c) => c.activa).length;
            return (
              <View key={region} style={styles.tarjeta}>
                <Pressable
                  style={styles.cabecera}
                  onPress={() => setRegionAbierta(abierta ? null : region)}
                  accessibilityRole="button">
                  <Text style={styles.region} numberOfLines={1}>
                    {nombreRegion(region)}
                  </Text>
                  <Text style={styles.contador}>{`${visibles}/${lista.length}`}</Text>
                  <Text style={[styles.flecha, abierta && styles.flechaAbierta]}>▼</Text>
                </Pressable>

                {abierta &&
                  lista.map((comuna) => (
                    <View key={comuna.id} style={styles.filaComuna}>
                      {/* El nombre entra a las categorías de esa comuna; el
                          interruptor solo decide si se ve en la app. */}
                      <Pressable
                        style={styles.zonaNombre}
                        onPress={() => router.push({ pathname: '/(app)/admin/comuna/[id]', params: { id: comuna.id } })}
                        accessibilityRole="button">
                        <Text style={[styles.comuna, !comuna.activa && styles.comunaOculta]} numberOfLines={1}>
                          {comuna.nombre}
                        </Text>
                      </Pressable>
                      <Interruptor
                        value={comuna.activa}
                        onValueChange={() => handleToggle(comuna)}
                      />
                    </View>
                  ))}
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
  content: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.six,
  },
  tarjeta: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: Spacing.two,
    overflow: 'hidden',
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  region: {
    fontFamily: Fonts.light,
    flex: 1,
    fontSize: 21,
    color: Colors.accent,
  },
  contador: {
    fontFamily: Fonts.light,
    fontSize: 12,
    color: Colors.textMuted,
  },
  flecha: {
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.accent,
  },
  flechaAbierta: {
    transform: [{ rotate: '180deg' }],
  },
  filaComuna: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.five,
    paddingRight: Spacing.four,
    paddingVertical: Spacing.two,
  },
  zonaNombre: {
    flex: 1,
    paddingVertical: Spacing.one,
  },
  comuna: {
    fontFamily: Fonts.light,
    fontSize: 19,
    color: Colors.text,
  },
  comunaOculta: {
    color: Colors.textMuted,
    opacity: 0.55,
  },
});import { compararRegiones, nombreRegion } from '@/lib/regiones';

