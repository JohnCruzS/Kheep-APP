import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { ComunaAdmin, actualizarComunaActiva, fetchComunasAdmin } from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { REJILLA, u } from '@/lib/rejilla';
import { useSession } from '@/providers/SessionProvider';

/**
 * Segunda pestaña del admin: las comunas del país.
 *
 * Las regiones son solo el cajón que agrupa — no se ocultan ni se editan, se
 * abren para llegar a sus comunas. Lo que se administra es cada comuna: si se
 * ve en la app y, entrando en ella, su catálogo de categorías y los perfiles
 * que publican en cada una.
 *
 * Las filas van juntas dentro de una sola tarjeta por región: con 346 comunas,
 * una tarjeta por cada una obligaba a desplazarse eternamente.
 */
export default function ComunasTabScreen() {
  const { profile, permisos } = useSession();
  // El de zona solo ve las comunas que cubre, y no puede mostrar u ocultar
  // comunas enteras: eso es del administrador general.
  const esGeneral = permisos?.esGeneral ?? false;
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
    const visibles = esGeneral ? comunas : comunas.filter((c) => permisos?.comunas.includes(c.id));
    for (const comuna of visibles) {
      const region = comuna.region ?? 'Sin región';
      const lista = porRegion.get(region);
      if (lista) lista.push(comuna);
      else porRegion.set(region, [comuna]);
    }
    return [...porRegion.entries()];
  }, [comunas, esGeneral, permisos]);

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

  if (profile && profile.rol !== 'admin' && profile.rol !== 'admin_zona') {
    return <Redirect href="/(app)/(tabs)/dashboard" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <EncabezadoMarca subtitulo="Chile" />

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
                    {region.replace(/^Regi[oó]n (de |del |de la )?/i, '')}
                  </Text>
                  <Text style={styles.contador}>{`${visibles}/${lista.length}`}</Text>
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
                          {'-  '}
                          {comuna.nombre}
                        </Text>
                      </Pressable>
                      {esGeneral && (
                        <Switch
                          value={comuna.activa}
                          onValueChange={() => handleToggle(comuna)}
                          trackColor={{ false: Colors.surfaceBorder, true: Colors.accent }}
                          thumbColor="#FFFFFF"
                        />
                      )}
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
    // Misma rejilla que el catálogo: 25 de 1000 a cada lado.
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingBottom: Spacing.six,
  },
  tarjeta: {
    backgroundColor: Colors.surface,
    borderRadius: u(REJILLA.curvatura),
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
    fontFamily: Fonts.medium,
    flex: 1,
    fontSize: 23,
    color: Colors.text,
  },
  contador: {
    fontFamily: Fonts.medium,
    fontSize: 17,
    color: Colors.accent,
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
    fontSize: 21,
    color: Colors.text,
  },
  comunaOculta: {
    color: Colors.textMuted,
    opacity: 0.55,
  },
});
