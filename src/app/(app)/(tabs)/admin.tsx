import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Texto';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Interruptor } from '@/components/ui/Interruptor';
import { Colors, Fonts, Spacing, TarjetaLista } from '@/constants/theme';
import { ComunaAdmin, actualizarComunaActiva } from '@/lib/catalog';
import { comunasEnMemoria, precargarComunas, recordarComunas } from '@/lib/cacheAdmin';
import { getErrorMessage } from '@/lib/errors';
import { compararRegiones, nombreRegion } from '@/lib/regiones';
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

  // Lo último que se trajo queda en memoria: al volver a la pestaña la lista
  // aparece al tiro y se refresca por detrás, sin ruedita. La ruedita sale
  // solo la primera vez, si todavía no llegó nada.
  const [comunas, setComunas] = useState<ComunaAdmin[]>(() => comunasEnMemoria() ?? []);
  const [loading, setLoading] = useState(() => comunasEnMemoria() === null);
  const [error, setError] = useState<string | null>(null);
  const [regionAbierta, setRegionAbierta] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setComunas(await precargarComunas());
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido.'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Al volver de la ficha de una comuna (o de crear una categoría) la lista
  // se vuelve a pedir: así los contadores y lo que está visible reflejan lo
  // que se acaba de cambiar, sin salir de la app.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const regiones = useMemo(() => {
    const porRegion = new Map<string, ComunaAdmin[]>();
    const visibles = esGeneral ? comunas : comunas.filter((c) => permisos?.comunas.includes(c.id));
    for (const comuna of visibles) {
      const region = comuna.region ?? 'Sin región';
      const lista = porRegion.get(region);
      if (lista) lista.push(comuna);
      else porRegion.set(region, [comuna]);
    }
    return [...porRegion.entries()].sort(([a], [b]) => compararRegiones(a, b));
  }, [comunas, esGeneral, permisos]);

  async function handleToggle(comuna: ComunaAdmin) {
    const nuevo = !comuna.activa;
    setComunas((list) => {
      const nueva = list.map((c) => (c.id === comuna.id ? { ...c, activa: nuevo } : c));
      recordarComunas(nueva);
      return nueva;
    });
    try {
      await actualizarComunaActiva(comuna.id, nuevo);
    } catch (err) {
      setComunas((list) => {
        const vuelta = list.map((c) => (c.id === comuna.id ? { ...c, activa: comuna.activa } : c));
        recordarComunas(vuelta);
        return vuelta;
      });
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
                    {nombreRegion(region)}
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
                        {/* Todas en blanco, como la maqueta: lo que dice si la
                            comuna se ve en la app es el interruptor, no el
                            color del nombre. */}
                        <Text style={styles.comuna} numberOfLines={1}>
                          {comuna.nombre}
                        </Text>
                      </Pressable>
                      {esGeneral && (
                        <Interruptor
                          value={comuna.activa}
                          onValueChange={() => handleToggle(comuna)}
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
  // Negra con un borde tenue, como la maqueta del cliente: el relleno gris de
  // antes tapaba el borde y la tarjeta se leía como un bloque plomo.
  tarjeta: {
    backgroundColor: TarjetaLista.fondo,
    borderRadius: u(REJILLA.curvatura),
    borderWidth: 1,
    borderColor: TarjetaLista.borde,
    marginBottom: TarjetaLista.separacion,
    overflow: 'hidden',
  },
  // Medidas tomadas de la maqueta del cliente: la fila de la región ocupa el
  // 21 % del ancho de la pantalla y su nombre entra a un 10,4 % del borde.
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: TarjetaLista.sangria,
    paddingVertical: TarjetaLista.aireVertical,
  },
  region: {
    fontFamily: Fonts.tarjeta,
    flex: 1,
    fontSize: TarjetaLista.tamanoTexto,
    lineHeight: TarjetaLista.altoLinea,
    color: Colors.text,
  },
  // Gris, no rojo: es un dato al margen —cuántas comunas de la región se ven
  // en la app—, no una alerta ni una acción.
  contador: {
    fontFamily: Fonts.medium,
    fontSize: 21,
    color: Colors.textMuted,
  },
  // Las comunas entran más adentro que el nombre de la región (14,2 % del
  // ancho, contra 10,4 %), como en la maqueta.
  filaComuna: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 47,
    paddingRight: 31,
    paddingVertical: Spacing.two,
  },
  zonaNombre: {
    flex: 1,
    paddingVertical: Spacing.one,
  },
  comuna: {
    fontFamily: Fonts.delgada,
    fontSize: 27,
    color: Colors.text,
  },
});
