import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalendarioRango, Rango, rangoHoy, textoRango } from '@/components/admin/CalendarioRango';
import { FiltrosOrden } from '@/components/admin/FiltrosOrden';
import { TarjetaDesplegable } from '@/components/admin/TarjetaDesplegable';
import { ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing, TarjetaLista } from '@/constants/theme';
import { FilaMetrica, fetchCategoriasAdmin, fetchComunasAdmin, fetchResumenMetricas } from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { REJILLA, u } from '@/lib/rejilla';
import { compararRegiones, nombreRegion } from '@/lib/regiones';
import { useSession } from '@/providers/SessionProvider';

const CERO = '00000000-0000-0000-0000-000000000000';

type Item = { tipo: string; label: string; conCategoria: boolean };

/**
 * Lo que se mide, todo en una fila que se desliza (pedido del cliente). En
 * Negocios los tres datos van juntos en cada fila: "R: 12 - L: 20 - T: 25"
 * (registros, logins y total).
 */
const DATOS: { label: string; items: Item[]; combinado?: boolean }[] = [
  { label: 'WhatsApp', items: [{ tipo: 'whatsapp', label: 'WhatsApp', conCategoria: true }] },
  { label: 'Banners', items: [{ tipo: 'banner_clic', label: 'Banners', conCategoria: false }] },
  { label: 'Categoría', items: [{ tipo: 'categoria', label: 'Categoría', conCategoria: true }] },
  {
    label: 'Negocios',
    combinado: true,
    items: [
      { tipo: 'negocios_nuevos', label: 'R', conCategoria: true },
      { tipo: 'login', label: 'L', conCategoria: true },
      { tipo: 'negocios', label: 'T', conCategoria: true },
    ],
  },
  { label: 'Publicados', items: [{ tipo: 'publicaciones', label: 'Publicados', conCategoria: true }] },
  { label: 'Fotos', items: [{ tipo: 'fotos', label: 'Fotos', conCategoria: true }] },
  { label: 'Banners publicados', items: [{ tipo: 'banners', label: 'Banners publicados', conCategoria: false }] },
];

const numero = (n: number) => n.toLocaleString('es-CL');

/**
 * Métricas (maqueta del cliente).
 *
 *  - Arriba, el total de la app en el lapso; tocar el lapso ("Hoy", de
 *    entrada) abre el calendario para elegir otro día o un lapso.
 *  - Lo que se mide se elige en una sola fila que se desliza, como las
 *    categorías del inicio.
 *  - Abajo, por región: tocar una muestra sus comunas; tocar una comuna
 *    muestra sus categorías ("- Iquique (5)"; tocarlo vuelve).
 *
 * El admin de zona ve solo sus comunas.
 */
export default function MetricasScreen() {
  const { permisos } = useSession();
  const router = useRouter();
  const [elegido, setElegido] = useState(0);
  const [rango, setRango] = useState<Rango>(rangoHoy);
  const [eligiendoFecha, setEligiendoFecha] = useState(false);
  const [filas, setFilas] = useState<FilaMetrica[]>([]);
  const [comunas, setComunas] = useState<Record<string, { nombre: string; region: string }>>({});
  const [categorias, setCategorias] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regionAbierta, setRegionAbierta] = useState<string | null>(null);
  const [comunaAbierta, setComunaAbierta] = useState<string | null>(null);

  const g = DATOS[elegido];
  const items = g.items;
  const conCategoria = items.every((i) => i.conCategoria);

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
      const todas = await fetchResumenMetricas(rango.desde, rango.hasta);
      setFilas(permisos?.esGeneral ? todas : todas.filter((f) => permisos?.comunas.includes(f.comuna_id)));
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudieron cargar las métricas.'));
    } finally {
      setLoading(false);
    }
  }, [rango, permisos]);

  useEffect(() => {
    load();
  }, [load]);

  /** Suma de cada dato del grupo, para las filas que cumplan `filtro`. */
  const sumar = useCallback(
    (filtro: (f: FilaMetrica) => boolean) =>
      items.map((it) => filas.filter((f) => f.tipo === it.tipo && filtro(f)).reduce((s, f) => s + f.total, 0)),
    [filas, items],
  );

  const regionDe = (comunaId: string) => (comunaId === CERO ? '' : (comunas[comunaId]?.region ?? ''));

  /** Las regiones con algo que mostrar, en el orden de siempre. */
  const regiones = useMemo(() => {
    const tipos = new Set(items.map((i) => i.tipo));
    const set = new Set<string>();
    for (const f of filas) if (tipos.has(f.tipo) && f.total > 0) set.add(regionDe(f.comuna_id));
    return [...set].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : compararRegiones(a, b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, items, comunas]);

  const comunasDe = (region: string) => {
    const tipos = new Set(items.map((i) => i.tipo));
    const set = new Set<string>();
    for (const f of filas) if (tipos.has(f.tipo) && f.total > 0 && regionDe(f.comuna_id) === region) set.add(f.comuna_id);
    return [...set].sort((a, b) => (comunas[a]?.nombre ?? '').localeCompare(comunas[b]?.nombre ?? '', 'es'));
  };

  const categoriasDe = (comunaId: string) => {
    const tipos = new Set(items.map((i) => i.tipo));
    const set = new Set<string>();
    for (const f of filas) if (tipos.has(f.tipo) && f.total > 0 && f.comuna_id === comunaId) set.add(f.categoria_id);
    return [...set].sort((a, b) => (categorias[a] ?? '').localeCompare(categorias[b] ?? '', 'es'));
  };

  /** "15", o en Negocios "R: 12 - L: 20 - T: 25". */
  const valor = (n: number[]) => (g.combinado ? n.map((x, i) => `${items[i].label}: ${numero(x)}`).join(' - ') : numero(n[0]));

  const totales = sumar(() => true);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false, animation: 'fade' }} />
      {/* "Informe" (maqueta del cliente). Dos toques en el logo pasan a la
          vista de Datos (solo el general la ve). */}
      <EncabezadoMarca
        subtitulo="Informe"
        onDobleToque={permisos?.esGeneral ? () => router.replace('/(app)/admin/limpieza') : undefined}
      />

      {/* Fijo arriba (pedido del cliente): el total y la fila de lo que se
          mide. Solo se desliza la lista de abajo. */}
      <View style={styles.fijo}>
        {/* El total de la app en el lapso; tocar el lapso abre el calendario. */}
        <Pressable style={styles.total} onPress={() => setEligiendoFecha(true)} accessibilityRole="button">
          {/* Un solo número (pedido del cliente). En Negocios es el total de
              negocios; R y L se ven en cada fila. */}
          <Text style={styles.totalNumero}>{numero(g.combinado ? totales[items.length - 1] : totales[0])}</Text>
          <Text style={styles.periodo}>{textoRango(rango)}</Text>
        </Pressable>

        {/* Todo lo que se mide, en una fila que se desliza. */}
        <View style={styles.items}>
          <FiltrosOrden
            opciones={DATOS.map((d, i) => ({ id: String(i), label: d.label }))}
            elegida={String(elegido)}
            grande
            onElegir={(id) => {
              setElegido(Number(id));
              setComunaAbierta(null);
            }}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false}>
        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={load} />}
        {!loading && !error && regiones.length === 0 && <Text style={styles.vacio}>Sin datos en este lapso.</Text>}

        {/* Una comuna abierta: sus categorías. Tocar el nombre vuelve. */}
        {!loading && !error && comunaAbierta && (
          <View style={styles.tarjetaComuna}>
            <Pressable onPress={() => setComunaAbierta(null)} hitSlop={8} accessibilityRole="button" style={styles.cabeceraComuna}>
              <Text style={styles.guion}>- </Text>
              <Text style={styles.nombreComuna} numberOfLines={1}>
                {comunas[comunaAbierta]?.nombre ?? 'Todas las comunas'}
              </Text>
              {/* En Negocios el total no va al lado: es largo, cortaba el nombre y ya
                  se vio en la lista anterior. */}
              {!g.combinado && (
                <Text style={styles.cuentaComuna}>{` (${valor(sumar((f) => f.comuna_id === comunaAbierta))})`}</Text>
              )}
            </Pressable>
            {categoriasDe(comunaAbierta).map((cat) => (
              <View key={cat} style={styles.filaCategoria}>
                <Text style={styles.nombreCategoria} numberOfLines={1}>
                  {cat === CERO ? 'Sin categoría' : (categorias[cat] ?? 'Categoría eliminada')}
                </Text>
                <Text style={[styles.cuentaCategoria, g.combinado && styles.cuentaCombinada]}>
                  {valor(sumar((f) => f.comuna_id === comunaAbierta && f.categoria_id === cat))}
                </Text>
              </View>
            ))}
          </View>
        )}

        {!loading &&
          !error &&
          !comunaAbierta &&
          regiones.map((region) => {
            const abierta = regionAbierta === region;
            return (
              <TarjetaDesplegable
                key={region || 'todas'}
                titulo={region ? nombreRegion(region) : 'Todas las comunas'}
                abierta={abierta}
                onAlternar={() => setRegionAbierta(abierta ? null : region)}
                alFinal={
                  <Text style={[styles.cuentaRegion, g.combinado && styles.cuentaCombinada]}>
                    {valor(sumar((f) => regionDe(f.comuna_id) === region))}
                  </Text>
                }>
                {comunasDe(region).map((comunaId) => (
                  <Pressable
                    key={comunaId}
                    style={styles.filaComuna}
                    // Las comunas se abren a sus categorías (los banners no tienen).
                    onPress={conCategoria ? () => setComunaAbierta(comunaId) : undefined}
                    disabled={!conCategoria}>
                    <Text style={styles.nombreFila} numberOfLines={1}>
                      {comunas[comunaId]?.nombre ?? 'Todas las comunas'}
                    </Text>
                    <Text style={[styles.cuentaFila, g.combinado && styles.cuentaCombinada]}>
                      {valor(sumar((f) => f.comuna_id === comunaId))}
                    </Text>
                  </Pressable>
                ))}
              </TarjetaDesplegable>
            );
          })}
      </ScrollView>

      <CalendarioRango
        visible={eligiendoFecha}
        rango={rango}
        onClose={() => setEligiendoFecha(false)}
        onListo={(r) => {
          setRango(r);
          setEligiendoFecha(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  fijo: {
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingTop: Spacing.two,
  },
  contenido: {
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
  },
  total: {
    backgroundColor: TarjetaLista.fondo,
    borderRadius: u(REJILLA.curvatura),
    borderWidth: 1,
    borderColor: TarjetaLista.borde,
    alignItems: 'center',
    paddingVertical: Spacing.five,
    marginBottom: Spacing.three,
  },
  totalNumero: {
    fontFamily: Fonts.medium,
    fontSize: 54,
    lineHeight: 64,
    color: Colors.accent,
  },
  periodo: {
    fontFamily: Fonts.delgada,
    fontSize: 26,
    color: Colors.text,
    marginTop: Spacing.one,
  },
  items: {
    marginVertical: Spacing.two,
  },
  vacio: {
    fontFamily: Fonts.delgada,
    fontSize: 16,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.four,
  },
  cuentaRegion: {
    fontFamily: Fonts.delgada,
    fontSize: TarjetaLista.tamanoTexto,
    color: Colors.accent,
  },
  // "R 0 - L 2 - T 3" es largo: más chico, para que se lea el nombre de la región.
  cuentaCombinada: {
    fontSize: 18,
  },
  filaComuna: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: Spacing.four,
    paddingVertical: Spacing.two,
  },
  nombreFila: {
    flex: 1,
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.text,
  },
  cuentaFila: {
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.textMuted,
  },
  tarjetaComuna: {
    backgroundColor: TarjetaLista.fondo,
    borderRadius: u(REJILLA.curvatura),
    borderWidth: 1,
    borderColor: TarjetaLista.borde,
    paddingHorizontal: TarjetaLista.sangria,
    paddingVertical: Spacing.four,
  },
  cabeceraComuna: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  guion: {
    fontFamily: Fonts.tarjeta,
    fontSize: TarjetaLista.tamanoTexto,
    color: Colors.accent,
  },
  nombreComuna: {
    flexShrink: 1,
    fontFamily: Fonts.tarjeta,
    fontSize: TarjetaLista.tamanoTexto,
    color: Colors.text,
  },
  cuentaComuna: {
    fontFamily: Fonts.delgada,
    fontSize: TarjetaLista.tamanoTexto,
    color: Colors.accent,
  },
  filaCategoria: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
  },
  nombreCategoria: {
    flex: 1,
    fontFamily: Fonts.tarjeta,
    fontSize: 22,
    color: Colors.text,
  },
  cuentaCategoria: {
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.accent,
  },
});
