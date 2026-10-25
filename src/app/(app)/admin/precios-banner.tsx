import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EditorPantalla } from '@/components/admin/EditorPantalla';
import { ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing, TarjetaLista } from '@/constants/theme';
import {
  ComunaAdmin,
  PRECIO_BANNER_POR_DIA,
  PreciosBanner,
  fetchComunasAdmin,
  fetchPreciosBanner,
  guardarPrecioComuna,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { REJILLA, u } from '@/lib/rejilla';
import { compararRegiones, nombreRegion } from '@/lib/regiones';

/** La comuna cuyo precio se está cambiando. */
type Elegido = { clave: string; nombre: string; precio: number | null };

const pesos = (n: number) => n.toLocaleString('es-CL');

/**
 * Precios de los banners (maqueta del cliente; se llega con dos toques en el
 * título de Banners): una tarjeta por región con su precio por día en rojo;
 * tocar el nombre muestra sus comunas, cada una con su precio propio si tiene
 * (si no, cobra el de su región).
 *
 * Todos parten en el precio base ($25.000 por día) y el precio se ve
 * siempre: una comuna sin precio propio muestra el de su región.
 *
 * El de la región es la suma de sus comunas (lo que cuesta un día en la
 * región completa) y se calcula solo. Lo que se edita es cada comuna: tocar
 * su precio abre directo la pantalla para cambiarlo (pedido del cliente).
 * Dejarlo vacío lo quita y la comuna vuelve a cobrar el de base.
 */
export default function PreciosBannerScreen() {
  const router = useRouter();
  const [comunas, setComunas] = useState<ComunaAdmin[]>([]);
  const [precios, setPrecios] = useState<PreciosBanner | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abiertas, setAbiertas] = useState<string[]>([]);
  const [elegido, setElegido] = useState<Elegido | null>(null);
  const [editando, setEditando] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [lista, p] = await Promise.all([fetchComunasAdmin(), fetchPreciosBanner()]);
      setComunas(lista);
      setPrecios(p);
      if (!p.disponible) setError('Falta ejecutar la migración 0043 en Supabase para los precios de los banners.');
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudieron cargar los precios.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const regiones = useMemo(() => [...new Set(comunas.map((c) => c.region))].sort(compararRegiones), [comunas]);
  const comunasDe = (region: string) => comunas.filter((c) => c.region === region);

  async function guardar(valor: string) {
    if (!elegido) return;
    const limpio = valor.replace(/\D/g, '');
    const precio = limpio ? Number(limpio) : null;
    await guardarPrecioComuna(elegido.clave, precio);
    await load();
  }

  /** Lo que cobra por día una comuna: el suyo, o si no tiene, el de base. */
  function precioDe(comuna: ComunaAdmin): number {
    return precios?.comunas[comuna.id] ?? precios?.regiones[comuna.region] ?? PRECIO_BANNER_POR_DIA;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false, animation: 'fade' }} />
      {/* "Banners", igual que la vista de los banners (pedido del cliente); dos
          toques en el logo vuelven a ella, como se llegó acá. */}
      <EncabezadoMarca subtitulo="Banners" onDobleToque={() => router.replace('/(app)/admin/banners')} />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && precios && (
        <ScrollView contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false}>
          {regiones.map((region) => {
            const abierta = abiertas.includes(region);
            return (
              <View key={region} style={styles.tarjeta}>
                <View style={styles.cabecera}>
                  <Pressable
                    style={styles.nombreZona}
                    onPress={() => setAbiertas((a) => (a.includes(region) ? a.filter((r) => r !== region) : [...a, region]))}
                    hitSlop={6}>
                    <Text style={styles.region} numberOfLines={1}>
                      {nombreRegion(region)}
                    </Text>
                  </Pressable>
                  {/* La región completa: la suma de sus comunas, sola. */}
                  <Text style={styles.precioRegion}>
                    {pesos(comunasDe(region).reduce((suma, c) => suma + precioDe(c), 0))}
                  </Text>
                </View>
                {abierta && (
                  <View style={styles.comunas}>
                    {comunasDe(region).map((comuna) => (
                      <View key={comuna.id} style={styles.filaComuna}>
                        <Text style={styles.comuna} numberOfLines={1}>
                          {comuna.nombre}
                        </Text>
                        {/* Tocar el precio abre directo el editor. */}
                        <Pressable
                          onPress={() => {
                            setElegido({ clave: comuna.id, nombre: comuna.nombre, precio: precioDe(comuna) });
                            setEditando(true);
                          }}
                          hitSlop={10}
                          accessibilityRole="button"
                          accessibilityLabel={`Precio de ${comuna.nombre}`}>
                          <Text style={styles.precioComuna}>{pesos(precioDe(comuna))}</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      <EditorPantalla
        visible={editando}
        subtitulo={elegido?.nombre ?? ''}
        placeholder="$ por día"
        inicial={elegido?.precio !== null && elegido?.precio !== undefined ? String(elegido.precio) : ''}
        propsCampo={{ keyboardType: 'number-pad', maxLength: 8 }}
        validar={(v) => {
          const limpio = v.replace(/\D/g, '');
          if (limpio && (Number(limpio) < 1 || Number(limpio) > 99999999)) return 'Escribe un precio válido.';
          return null;
        }}
        onCerrar={() => setEditando(false)}
        onGuardar={guardar}
      />
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
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
  },
  tarjeta: {
    backgroundColor: TarjetaLista.fondo,
    borderRadius: u(REJILLA.curvatura),
    borderWidth: 1,
    borderColor: TarjetaLista.borde,
    marginBottom: u(REJILLA.margenLateral),
    paddingHorizontal: TarjetaLista.sangria,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: u(240) - 2,
  },
  nombreZona: {
    flex: 1,
  },
  region: {
    fontFamily: Fonts.tarjeta,
    fontSize: TarjetaLista.tamanoTexto,
    color: Colors.text,
  },
  precioRegion: {
    fontFamily: Fonts.delgada,
    fontSize: TarjetaLista.tamanoTexto,
    color: Colors.accent,
    minWidth: 40,
    textAlign: 'right',
  },
  comunas: {
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  filaComuna: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: Spacing.four,
  },
  comuna: {
    flex: 1,
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.text,
  },
  precioComuna: {
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.accent,
    minWidth: 40,
    textAlign: 'right',
  },
  // El elegido, subrayado: es el que cambia el botón de abajo.
  precioElegido: {
    textDecorationLine: 'underline',
  },
  pie: {
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingTop: Spacing.two,
  },
  boton: {
    paddingVertical: Spacing.four,
    borderRadius: u(REJILLA.curvatura),
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  botonPresionado: {
    backgroundColor: Colors.accentPressed,
  },
  botonLabel: {
    fontFamily: Fonts.medium,
    fontSize: 24,
    color: '#FFFFFF',
  },
});
