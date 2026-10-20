import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FiltrosOrden } from '@/components/admin/FiltrosOrden';
import { TarjetaDesplegable } from '@/components/admin/TarjetaDesplegable';
import { ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { FilaMetrica, fetchCategoriasAdmin, fetchComunasAdmin, fetchResumenMetricas } from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { REJILLA, u } from '@/lib/rejilla';
import { nombreRegion } from '@/lib/regiones';
import { useSession } from '@/providers/SessionProvider';

const CERO = '00000000-0000-0000-0000-000000000000';

type Periodo = 'hoy' | '7' | '30' | 'todo';
type Por = 'region' | 'comuna' | 'categoria';

/**
 * Lo que se mide (pedido del cliente), en secciones con tres datos cada una.
 * Cada dato se puede abrir por región, por comuna o por categoría.
 */
const SECCIONES: { titulo: string; datos: { tipo: string; label: string }[] }[] = [
  {
    titulo: 'Enlaces',
    datos: [
      { tipo: 'whatsapp', label: 'WhatsApp' },
      { tipo: 'banner_clic', label: 'Banners' },
      { tipo: 'categoria', label: 'Categorías' },
    ],
  },
  {
    titulo: 'Vistas',
    datos: [
      { tipo: 'publicacion_vista', label: 'Publicaciones' },
      { tipo: 'publicacion_completa', label: 'Completas' },
      { tipo: 'banner_vista', label: 'Banners' },
    ],
  },
  {
    titulo: 'Negocios',
    datos: [
      { tipo: 'negocios', label: 'Total' },
      { tipo: 'negocios_nuevos', label: 'Nuevos' },
      { tipo: 'login', label: 'Inicios de sesión' },
    ],
  },
  {
    titulo: 'Publicaciones',
    datos: [
      { tipo: 'publicaciones', label: 'Publicaciones' },
      { tipo: 'fotos', label: 'Fotos subidas' },
      { tipo: 'banners', label: 'Banners publicados' },
    ],
  },
];

/**
 * Desde qué día cuenta cada periodo (AAAA-MM-DD), o null. Con la fecha del
 * teléfono: en el teléfono no se puede convertir a otra zona horaria, y el
 * admin está en Chile, que es la hora con que la base guarda los días.
 */
function desdeDe(periodo: Periodo): string | null {
  if (periodo === 'todo') return null;
  const dias = periodo === 'hoy' ? 0 : Number(periodo) - 1;
  const d = new Date(Date.now() - dias * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const numero = (n: number) => n.toLocaleString('es-CL');

/**
 * Métricas (Panel → Métricas): Enlaces, Vistas, Negocios y Publicaciones, con
 * tres datos cada una. Tocar una sección la abre; tocar un dato lo abre por
 * región, comuna o categoría, de mayor a menor. Arriba, el periodo.
 *
 * El admin de zona ve solo sus comunas.
 */
export default function MetricasScreen() {
  const { permisos } = useSession();
  // Siempre el total, sin elegir periodo (pedido del cliente).
  const periodo: Periodo = 'todo';
  const [filas, setFilas] = useState<FilaMetrica[]>([]);
  const [comunas, setComunas] = useState<Record<string, { nombre: string; region: string }>>({});
  const [categorias, setCategorias] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seccionAbierta, setSeccionAbierta] = useState<string | null>('Enlaces');
  const [datoAbierto, setDatoAbierto] = useState<string | null>(null);
  const [por, setPor] = useState<Por>('region');

  // Los nombres, una sola vez.
  useEffect(() => {
    Promise.all([fetchComunasAdmin(), fetchCategoriasAdmin()])
      .then(([cs, cats]) => {
        setComunas(Object.fromEntries(cs.map((c) => [c.id, { nombre: c.nombre, region: c.region }])));
        setCategorias(Object.fromEntries(cats.map((c) => [c.id, c.nombre])));
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const todas = await fetchResumenMetricas(desdeDe(periodo));
      // El de zona ve las de sus comunas.
      setFilas(permisos?.esGeneral ? todas : todas.filter((f) => permisos?.comunas.includes(f.comuna_id)));
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudieron cargar las métricas.'));
    } finally {
      setLoading(false);
    }
  }, [periodo, permisos]);

  useEffect(() => {
    load();
  }, [load]);

  const totalDe = useCallback(
    (tipo: string) => filas.filter((f) => f.tipo === tipo).reduce((s, f) => s + f.total, 0),
    [filas],
  );

  /** Un dato repartido por región, comuna o categoría, de mayor a menor. */
  const desglose = useMemo(() => {
    if (!datoAbierto) return [];
    const grupos = new Map<string, number>();
    for (const f of filas) {
      if (f.tipo !== datoAbierto) continue;
      const nombre =
        por === 'categoria'
          ? f.categoria_id === CERO
            ? 'Sin categoría'
            : (categorias[f.categoria_id] ?? 'Categoría eliminada')
          : f.comuna_id === CERO
            ? 'Todas las comunas'
            : por === 'comuna'
              ? (comunas[f.comuna_id]?.nombre ?? '—')
              : nombreRegion(comunas[f.comuna_id]?.region ?? '—');
      grupos.set(nombre, (grupos.get(nombre) ?? 0) + f.total);
    }
    return [...grupos.entries()].sort((a, b) => b[1] - a[1]);
  }, [datoAbierto, filas, por, comunas, categorias]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <EncabezadoMarca subtitulo="Métricas" />


      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && (
        <ScrollView contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false}>
          {SECCIONES.map((seccion) => {
            const abierta = seccionAbierta === seccion.titulo;
            const total = seccion.datos.reduce((s, d) => s + totalDe(d.tipo), 0);
            return (
              <TarjetaDesplegable
                key={seccion.titulo}
                titulo={seccion.titulo}
                abierta={abierta}
                onAlternar={() => {
                  setSeccionAbierta(abierta ? null : seccion.titulo);
                  setDatoAbierto(null);
                }}
                alFinal={!abierta ? <Text style={styles.totalSeccion}>{numero(total)}</Text> : undefined}>
                {seccion.datos.map((dato) => {
                  const datoEstaAbierto = datoAbierto === dato.tipo;
                  return (
                    <View key={dato.tipo}>
                      <Pressable
                        style={styles.filaDato}
                        onPress={() => setDatoAbierto(datoEstaAbierto ? null : dato.tipo)}
                        accessibilityRole="button">
                        <Text style={[styles.dato, datoEstaAbierto && styles.datoAbierto]}>{dato.label}</Text>
                        <Text style={styles.valor}>{numero(totalDe(dato.tipo))}</Text>
                      </Pressable>
                      {datoEstaAbierto && (
                        <View style={styles.desglose}>
                          <FiltrosOrden
                            opciones={[
                              { id: 'region', label: 'Región' },
                              { id: 'comuna', label: 'Comuna' },
                              ...(dato.tipo === 'banners' ? [] : [{ id: 'categoria' as const, label: 'Categoría' }]),
                            ]}
                            elegida={dato.tipo === 'banners' && por === 'categoria' ? 'region' : por}
                            onElegir={setPor}
                          />
                          {desglose.length === 0 ? (
                            <Text style={styles.sinDatos}>Sin datos en este periodo.</Text>
                          ) : (
                            desglose.map(([nombre, n]) => (
                              <View key={nombre} style={styles.filaDesglose}>
                                <Text style={styles.nombreDesglose} numberOfLines={1}>
                                  {nombre}
                                </Text>
                                <Text style={styles.valorDesglose}>{numero(n)}</Text>
                              </View>
                            ))
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </TarjetaDesplegable>
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
  contenido: {
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingBottom: Spacing.five,
  },
  totalSeccion: {
    fontFamily: Fonts.delgada,
    fontSize: 27.5,
    color: Colors.accent,
  },
  filaDato: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
  },
  dato: {
    fontFamily: Fonts.delgada,
    fontSize: 21,
    color: Colors.text,
  },
  datoAbierto: {
    color: Colors.accent,
  },
  valor: {
    fontFamily: Fonts.delgada,
    fontSize: 21,
    color: Colors.accent,
  },
  desglose: {
    paddingLeft: Spacing.three,
    paddingBottom: Spacing.three,
  },
  filaDesglose: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
  nombreDesglose: {
    flex: 1,
    fontFamily: Fonts.delgada,
    fontSize: 17,
    color: Colors.textMuted,
  },
  valorDesglose: {
    fontFamily: Fonts.delgada,
    fontSize: 17,
    color: Colors.text,
  },
  sinDatos: {
    fontFamily: Fonts.delgada,
    fontSize: 15,
    color: Colors.textMuted,
  },
});
