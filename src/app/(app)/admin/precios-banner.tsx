import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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
  guardarPrecioRegion,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { REJILLA, u } from '@/lib/rejilla';
import { compararRegiones, nombreRegion } from '@/lib/regiones';

/** Lo que se está por cambiar: el precio de una región o el de una comuna. */
type Elegido = { tipo: 'region' | 'comuna'; clave: string; nombre: string; precio: number | null };

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
 * Tocar un precio lo elige y aparece abajo el botón rojo con ese valor; el
 * botón abre la pantalla para cambiarlo. Dejarlo vacío lo quita: la comuna
 * vuelve a cobrar el de su región, y la región el precio base.
 */
export default function PreciosBannerScreen() {
  const insets = useSafeAreaInsets();
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
    if (elegido.tipo === 'region') await guardarPrecioRegion(elegido.clave, precio);
    else await guardarPrecioComuna(elegido.clave, precio);
    setElegido({ ...elegido, precio });
    await load();
  }

  /** El precio de una fila, tocable aunque esté vacío. */
  function precioTocable(e: Elegido, grande: boolean) {
    const activo = elegido?.tipo === e.tipo && elegido.clave === e.clave;
    return (
      <Pressable onPress={() => setElegido(e)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Precio de ${e.nombre}`}>
        <Text style={[grande ? styles.precioRegion : styles.precioComuna, activo && styles.precioElegido]}>
          {pesos(e.precio ?? 0)}
        </Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <EncabezadoMarca subtitulo="Banner" />

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
                  {precioTocable(
                    {
                      tipo: 'region',
                      clave: region,
                      nombre: nombreRegion(region),
                      precio: precios.regiones[region] ?? PRECIO_BANNER_POR_DIA,
                    },
                    true,
                  )}
                </View>
                {abierta && (
                  <View style={styles.comunas}>
                    {comunasDe(region).map((comuna) => (
                      <View key={comuna.id} style={styles.filaComuna}>
                        <Text style={styles.comuna} numberOfLines={1}>
                          {comuna.nombre}
                        </Text>
                        {/* Sin precio propio, el de su región. */}
                        {precioTocable(
                          {
                            tipo: 'comuna',
                            clave: comuna.id,
                            nombre: comuna.nombre,
                            precio: precios.comunas[comuna.id] ?? precios.regiones[region] ?? PRECIO_BANNER_POR_DIA,
                          },
                          false,
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Aparece al elegir un precio: con su valor, y abre la pantalla para cambiarlo. */}
      {elegido && (
        <View style={[styles.pie, { paddingBottom: Spacing.three + insets.bottom }]}>
          <Pressable
            style={({ pressed }) => [styles.boton, pressed && styles.botonPresionado]}
            onPress={() => setEditando(true)}
            accessibilityRole="button">
            <Text style={styles.botonLabel}>{`$ ${pesos(elegido.precio ?? PRECIO_BANNER_POR_DIA)}`}</Text>
          </Pressable>
        </View>
      )}

      <EditorPantalla
        visible={editando}
        subtitulo={elegido?.nombre ?? ''}
        placeholder="$ por día"
        inicial={elegido?.precio !== null && elegido?.precio !== undefined ? String(elegido.precio) : ''}
        propsCampo={{ keyboardType: 'number-pad' }}
        validar={(v) => {
          const limpio = v.replace(/\D/g, '');
          if (limpio && (Number(limpio) < 1 || Number(limpio) > 100000000)) return 'Escribe un precio válido.';
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
