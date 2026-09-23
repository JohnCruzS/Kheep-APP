import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { BannerAdmin, CUPO_BANNERS, eliminarBanner, fetchBannersActivosAdmin } from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { useSession } from '@/providers/SessionProvider';
import { REJILLA, u } from '@/lib/rejilla';

/**
 * Cuánto le queda al banner, como HH:MM:SS (documento EDIT APP). Pasado un
 * día se dice en días: "3 d 04:15:20" es ilegible, y a esa distancia lo que
 * importa es el día, no el segundo.
 */
function restante(fechaInicio: string | null, fechaFin: string | null): string {
  if (!fechaFin) return 'Sin vencimiento';
  const ms = new Date(fechaFin).getTime() - Date.now();
  if (ms <= 0) return 'Terminado';

  // Lo contratado, para leer "lo que queda / lo que duraba".
  const total = fechaInicio ? new Date(fechaFin).getTime() - new Date(fechaInicio).getTime() : null;
  const totalTexto = total ? ` / ${Math.round(total / 3600000)}:00` : '';

  // Pasadas 48 horas, "568:08:51" no lo lee nadie: se cuenta en días.
  if (ms > 48 * 3600000) {
    const dias = Math.floor(ms / 86400000);
    const horas = Math.floor((ms % 86400000) / 3600000);
    const totalDias = total ? ` / ${Math.round(total / 86400000)} d` : '';
    return `${dias} d ${String(horas).padStart(2, '0')} h${totalDias}`;
  }

  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const seg = Math.floor((ms % 60000) / 1000);
  return [h, m, seg].map((n) => String(n).padStart(2, '0')).join(':') + totalTexto;
}

/** DD/MM/AAAA, el mismo formato que el resto de la app. */
function fecha(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Banners que hoy se ven en el carrusel del catálogo, con opción de
 * eliminarlos (por ejemplo, uno con contenido inapropiado).
 */
export default function BannersAdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { permisos } = useSession();
  const [banners, setBanners] = useState<BannerAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);
  /** En qué banner está el carrusel: lo que se ve debajo es de ESE banner. */
  const [indice, setIndice] = useState(0);
  /** Ancho real de una página, medido del contenedor. */
  const [ancho, setAncho] = useState(0);
  // El tiempo restante se redibuja cada segundo: es una cuenta atrás, y
  // congelada no dice nada.
  const [, setTic] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTic((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const todos = await fetchBannersActivosAdmin();
      // El de zona administra los banners de sus comunas; los de "todas las
      // comunas" son del administrador general.
      setBanners(
        permisos?.esGeneral ? todos : todos.filter((b) => b.comuna_id && permisos?.comunas.includes(b.comuna_id)),
      );
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido.'));
    } finally {
      setLoading(false);
    }
  }, [permisos]);

  useEffect(() => {
    load();
  }, [load]);

  function handleEliminar(banner: BannerAdmin) {
    const deQuien = banner.autor?.nombre ? ` de ${banner.autor.nombre}` : '';
    Alert.alert(
      'Eliminar banner',
      `¿Eliminar este banner${deQuien}? Deja de mostrarse en la app de inmediato y no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setEliminando(banner.id);
            try {
              await eliminarBanner(banner.id);
              setBanners((list) => list.filter((b) => b.id !== banner.id));
              // Si se borró el último, el carrusel se queda sin esa página.
              setIndice((i) => Math.max(0, Math.min(i, banners.length - 2)));
            } catch (err) {
              setError(getErrorMessage(err, 'No se pudo eliminar el banner.'));
            } finally {
              setEliminando(null);
            }
          },
        },
      ],
    );
  }

  function medirAncho(e: LayoutChangeEvent) {
    setAncho(Math.round(e.nativeEvent.layout.width));
  }

  function alDeslizar(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (ancho <= 0) return;
    const nuevo = Math.max(0, Math.min(banners.length - 1, Math.round(e.nativeEvent.contentOffset.x / ancho)));
    setIndice((anterior) => (anterior === nuevo ? anterior : nuevo));
  }

  /** El banner que se está mirando: de él son todos los datos de la tarjeta. */
  const actual = banners[Math.min(indice, banners.length - 1)];
  /** Cuánto del carrusel se lleva recorrido: un tramo por banner, entero en el último. */
  const avance = banners.length > 0 ? Math.min(1, (indice + 1) / banners.length) : 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Publicar y ver los activos son la misma pantalla: son las dos caras
          de lo mismo y separarlas obligaba a salir y volver a entrar. */}
      <EncabezadoMarca subtitulo="Banners" onVolver={() => router.back()} />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && banners.length === 0 && (
        <EmptyState title="No hay banners activos" message="Cuando haya banners mostrándose en la app, aparecerán acá." />
      )}

      {/* Lo único que se desliza es la IMAGEN: los datos —el lugar en el
          cupo, el tiempo, las métricas y el pie— se quedan quietos en su
          sitio y pasan a ser los del banner que se está mirando. */}
      {!loading && !error && banners.length > 0 && actual && (
        <View style={styles.carrusel} onLayout={medirAncho}>
          <View style={styles.card}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={alDeslizar}
              onMomentumScrollEnd={alDeslizar}
              scrollEventThrottle={16}
              style={styles.tiraImagenes}>
              {banners.map((banner) => (
                <Image
                  key={banner.id}
                  source={{ uri: banner.imagen_url }}
                  style={[styles.imagen, { width: ancho }]}
                  contentFit="cover"
                />
              ))}
            </ScrollView>

            {/* En qué lugar del cupo va el que se está viendo: "2/5" es el
                segundo de los cinco espacios del carrusel. */}
            <Text style={[styles.cupo, banners.length >= CUPO_BANNERS && styles.cupoLleno]}>
              {indice + 1}/{CUPO_BANNERS}
            </Text>

            {/* La barra dice por dónde va el carrusel: se llena un tramo por
                banner y queda entera roja en el último. */}
            <View style={styles.barra}>
              <View style={[styles.barraLlena, { flex: avance }]} />
              {avance < 1 && <View style={{ flex: 1 - avance }} />}
            </View>

            <Text style={styles.cuentaAtras} numberOfLines={1}>
              {restante(actual.fecha_inicio, actual.fecha_fin)}
            </Text>

            {/* Lo que quiere saber quien lo pagó. */}
            <View style={styles.metricas}>
              <Text style={styles.metricaEtiqueta}>
                Vistas <Text style={styles.metricaValor}>{actual.vistas.toLocaleString('es-CL')}</Text>
              </Text>
              {actual.enlace ? (
                <Text style={styles.metricaEtiqueta}>
                  Enlace <Text style={styles.metricaValor}>{actual.clics.toLocaleString('es-CL')}</Text>
                </Text>
              ) : (
                <Text style={styles.sinEnlace}>Sin enlace</Text>
              )}
            </View>

            <View style={styles.pieCard}>
              {/* En dos líneas: en una sola, la fecha se cortaba con puntos
                  suspensivos y era justo lo que había que saber. */}
              <View style={styles.detalleBloque}>
                <Text style={styles.detalle}>
                  {(actual.autor?.nombre ?? 'Banner del sistema') +
                    ' · ' +
                    (actual.comuna?.nombre ?? 'Todas las comunas')}
                </Text>
                {actual.fecha_fin && <Text style={styles.detalle}>Hasta el {fecha(actual.fecha_fin)}</Text>}
              </View>
              <Pressable
                onPress={() => handleEliminar(actual)}
                disabled={eliminando === actual.id}
                style={({ pressed }) => [styles.eliminarBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Eliminar banner">
                <Text style={styles.eliminarLabel}>{eliminando === actual.id ? 'Eliminando…' : 'Eliminar'}</Text>
              </Pressable>
            </View>
          </View>

        </View>
      )}

      {/* Espacio libre: el botón va DEBAJO de la tarjeta, nunca encima. */}
      <View style={styles.hueco} />

      {/* El botón queda abajo, al alcance del pulgar y después de ver lo que
          ya hay publicado (documento EDIT APP). */}
      <Pressable
        style={({ pressed }) => [
          styles.publicar,
          { marginBottom: Spacing.three + insets.bottom },
          pressed && styles.publicarPresionado,
        ]}
        onPress={() => router.push('/(app)/banner/publicar')}>
        <Text style={styles.publicarLabel}>Nuevo</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  cupo: {
    fontFamily: Fonts.light,
    fontSize: 19,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: Spacing.three,
  },
  cupoLleno: {
    color: Colors.warning,
  },
  barra: {
    flexDirection: 'row',
    height: 2,
    marginHorizontal: Spacing.four,
    backgroundColor: '#FFFFFF',
  },
  barraLlena: {
    backgroundColor: Colors.accent,
  },
  cuentaAtras: {
    fontFamily: Fonts.light,
    fontSize: 17,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: Spacing.three,
  },
  metricas: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.five,
    paddingBottom: Spacing.three,
  },
  metricaEtiqueta: {
    fontFamily: Fonts.light,
    fontSize: 17,
    color: Colors.accent,
  },
  metricaValor: {
    color: Colors.text,
  },
  sinEnlace: {
    fontFamily: Fonts.light,
    fontSize: 17,
    color: Colors.textMuted,
  },
  pieCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  carrusel: {
    marginHorizontal: u(REJILLA.margenLateral),
    marginTop: Spacing.three,
  },
  hueco: {
    flex: 1,
  },
  publicar: {
    marginHorizontal: u(REJILLA.margenLateral),
    paddingVertical: Spacing.four,
    borderRadius: u(REJILLA.curvatura),
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  publicarPresionado: {
    backgroundColor: Colors.accentPressed,
  },
  publicarLabel: {
    fontFamily: Fonts.medium,
    fontSize: 21,
    color: '#FFFFFF',
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
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
  },
  ayuda: {
    // Sin `flex`, el texto empuja el cupo fuera de la pantalla.
    flex: 1,
    fontFamily: Fonts.light,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textMuted,
    marginBottom: Spacing.three,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: u(REJILLA.curvatura),
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  tiraImagenes: {
    // Sin esto, la tira de imágenes se estira al alto de la tarjeta entera.
    flexGrow: 0,
  },
  imagen: {
    // El mismo alto que en el catálogo: el admin lo ve como lo ven todos.
    height: u(REJILLA.bannerAlto),
    backgroundColor: Colors.backgroundAlt,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  infoTexto: {
    flex: 1,
  },
  autor: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.text,
  },
  detalleBloque: {
    // Sin `flex`, el texto empuja "Eliminar" fuera de la tarjeta.
    flex: 1,
    gap: 2,
  },
  detalle: {
    fontFamily: Fonts.light,
    fontSize: 12,
    color: Colors.textMuted,
  },
  eliminarBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 10,
    backgroundColor: 'rgba(217,8,4,0.15)',
  },
  pressed: {
    opacity: 0.7,
  },
  eliminarLabel: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: Colors.danger,
  },
});
