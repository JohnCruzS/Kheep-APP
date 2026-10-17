import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, ErrorState } from '@/components/catalog/CatalogState';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { FotoRemota } from '@/components/ui/FotoRemota';
import { Ionicons } from '@expo/vector-icons';
import { UbicacionBanner } from '@/components/admin/UbicacionBanner';
import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { bannersEnMemoria, precargarBanners } from '@/lib/cacheAdmin';
import {
  BannerAdmin,
  pausarBanner,
  eliminarBanner,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { REJILLA, u } from '@/lib/rejilla';
import { useSession } from '@/providers/SessionProvider';

const HORA = 3600000;
const DIA = 24 * HORA;

const dos = (n: number) => String(n).padStart(2, '0');

/** 20:45:30 (horas, minutos y segundos). */
function hms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}`;
}

/** 3 d 04:15 (días, horas y minutos): para banners de varios días. */
function dhm(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(m / 1440)} d ${dos(Math.floor((m % 1440) / 60))}:${dos(m % 60)}`;
}

/**
 * El tiempo del banner, en los dos formatos de la maqueta del cliente (se
 * pasa de uno a otro tocándolo):
 *  - transcurrido: cuánto lleva de lo contratado, "20:45:30 / 24:00";
 *  - restante: cuánto le queda, "3:14:30".
 * Pasadas las 48 horas, las horas sueltas ("356:08:51") no las lee nadie: se
 * cuenta en días ("3 d 04:15 / 15 d").
 */
function tiempo(banner: BannerAdmin, verRestante: boolean): string {
  if (!banner.fecha_fin) return 'Sin vencimiento';
  const fin = new Date(banner.fecha_fin).getTime();
  const inicio = banner.fecha_inicio ? new Date(banner.fecha_inicio).getTime() : null;
  // En pausa, el reloj queda detenido en el momento en que se pausó.
  const ahora = banner.pausado_en ? new Date(banner.pausado_en).getTime() : Date.now();
  if (fin <= ahora) return 'Terminado';

  const total = inicio ? fin - inicio : null;
  const enDias = (total ?? fin - ahora) > 48 * HORA;
  if (verRestante || inicio === null || total === null) return enDias ? dhm(fin - ahora) : hms(fin - ahora);

  const llevado = Math.min(total, Math.max(0, ahora - inicio));
  return enDias
    ? `${dhm(llevado)} / ${Math.round(total / DIA)} d`
    : `${hms(llevado)} / ${Math.round(total / HORA)}:00`;
}

/** DD/MM/AAAA, el mismo formato que el resto de la app. */
function fecha(iso: string): string {
  const d = new Date(iso);
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** "https://www.kheep.cl/" → "www.kheep.cl": el enlace como se lee. */
function enlaceCorto(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

/**
 * Banners (maqueta del cliente): los banners publicados, de a uno. La imagen
 * va al alto con que se ve en el inicio y se pasa con el dedo; todo lo de
 * abajo es del banner que está en pantalla:
 *  - "3/6": cuál se está viendo de cuántos hay;
 *  - la barra: por dónde va el carrusel (crece con cada banner; entera
 *    roja en el último);
 *  - el tiempo (tocarlo cambia entre transcurrido y restante) y, a su
 *    derecha, "V-150" (veces que se vio) o "U-25" (personas distintas que
 *    lo vieron): se ve uno y tocarlo cambia al otro;
 *  - el enlace;
 *  - Ubicación (la lista de regiones y comunas, encendidas donde está),
 *    Eliminar (lo borra para siempre) y Pausar / Reanudar (en pausa no sale
 *    en el carrusel y su tiempo se congela; al reanudar sigue con lo que le
 *    quedaba).
 *    el carrusel).
 * Abajo, "Nuevo" para publicar otro.
 */
export default function BannersAdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { permisos } = useSession();
  const filtrar = useCallback(
    (todos: BannerAdmin[]) =>
      // El de zona administra los banners de sus comunas; los de "todas las
      // comunas" son del administrador general.
      permisos?.esGeneral ? todos : todos.filter((b) => b.comuna_id && permisos?.comunas.includes(b.comuna_id)),
    [permisos],
  );
  // Lo que dejó precargado el panel: se muestra al tiro y por detrás se vuelve a pedir.
  const precargados = bannersEnMemoria();
  const [banners, setBanners] = useState<BannerAdmin[]>(precargados ? filtrar(precargados) : []);
  const [loading, setLoading] = useState(precargados === null);
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);
  /** En qué banner está el carrusel: lo que se ve debajo es de ESE banner. */
  const [indice, setIndice] = useState(0);
  /** Dónde va el carrusel mientras se desliza (1,4 = entre el 2.º y el 3.º): la barra lo sigue. */
  const [posicion, setPosicion] = useState(0);
  const [ancho, setAncho] = useState(0);
  /** Tocar el tiempo: transcurrido ↔ restante. */
  const [verRestante, setVerRestante] = useState(false);
  /** Tocar las vistas: V (veces que se vio) ↔ U (personas distintas). */
  const [verUnicas, setVerUnicas] = useState(false);
  /** Las comunas donde está el banner, para la vista "Ubicación" (null = todas). */
  const [ubicacion, setUbicacion] = useState<string[] | null | undefined>(undefined);
  // El tiempo se redibuja cada segundo: congelado no dice nada.
  const [, setTic] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTic((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      setBanners(filtrar(await precargarBanners()));
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido.'));
    } finally {
      setLoading(false);
    }
  }, [filtrar]);

  // Al volver de "Nuevo" se recarga: así aparece el recién publicado.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

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
              setIndice((i) => Math.max(0, Math.min(i, banners.length - 2)));
              setPosicion((p) => Math.max(0, Math.min(p, banners.length - 2)));
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

  const [pausando, setPausando] = useState<string | null>(null);

  /** Pausar / Reanudar: lo hace la base y se recarga para traer el tiempo corrido. */
  async function alternarPausa(banner: BannerAdmin) {
    const pausar = banner.pausado_en === null;
    setPausando(banner.id);
    try {
      await pausarBanner(banner.id, pausar);
      await load();
    } catch (err) {
      Alert.alert(pausar ? 'No se pudo pausar' : 'No se pudo reanudar', getErrorMessage(err, 'Intenta de nuevo.'));
    } finally {
      setPausando(null);
    }
  }

  /**
   * Ubicación: dónde se muestra. Un banner publicado en varias comunas son
   * varias copias con la misma imagen; se juntan todas las comunas de esas
   * copias. Una copia para "todas las comunas" las enciende todas.
   */
  function verUbicacion(banner: BannerAdmin) {
    const copias = banners.filter((b) => b.imagen_url === banner.imagen_url);
    setUbicacion(copias.some((b) => b.comuna_id === null) ? null : copias.map((b) => b.comuna_id as string));
  }

  function medirAncho(e: LayoutChangeEvent) {
    setAncho(Math.round(e.nativeEvent.layout.width));
  }

  function alDeslizar(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (ancho <= 0) return;
    const exacta = Math.max(0, Math.min(banners.length - 1, e.nativeEvent.contentOffset.x / ancho));
    setPosicion(exacta);
    const nuevo = Math.round(exacta);
    setIndice((anterior) => (anterior === nuevo ? anterior : nuevo));
  }

  const actual = banners[Math.min(indice, banners.length - 1)];
  // La barra crece a medida que se avanza por los banners: un tramo por
  // banner, y entera roja en el último (pedido del cliente).
  const avance = banners.length > 0 ? Math.min(1, (posicion + 1) / banners.length) : 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Dos toques en el título: los precios por región y comuna (solo el general). */}
      <EncabezadoMarca
        subtitulo="Banners"
        onDobleToque={permisos?.esGeneral ? () => router.push('/(app)/admin/precios-banner') : undefined}
      />

      {loading && <View style={[styles.marco, styles.imagen, styles.silueta]} />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && banners.length === 0 && (
        <EmptyState title="No hay banners publicados" message="Cuando haya banners en la app, aparecerán acá." />
      )}

      {!loading && !error && banners.length > 0 && actual && (
        <ScrollView contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false}>
          {/* Solo la imagen se desliza; los datos de abajo pasan a ser los del
              banner que se está mirando. */}
          <View style={styles.marco} onLayout={medirAncho}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={alDeslizar}
              onMomentumScrollEnd={alDeslizar}
              scrollEventThrottle={16}
              style={styles.tira}>
              {banners.map((banner) => (
                <FotoRemota
                  key={banner.id}
                  uri={banner.imagen_url}
                  ancho={ancho}
                  style={[styles.imagen, { width: ancho }, banner.pausado_en !== null && styles.apagada]}
                />
              ))}
            </ScrollView>
          </View>

          {/* Cuál se está viendo de cuántos hay: "3/6". */}
          <Text style={styles.cupo}>
            {indice + 1}/{banners.length}
          </Text>

          {/* Por dónde va el carrusel: crece con cada banner, entera en el último. */}
          <View style={styles.barra}>
            <View style={[styles.barraLlena, { flex: avance }]} />
            {avance < 1 && <View style={{ flex: 1 - avance }} />}
          </View>

          <View style={styles.fila}>
            <View style={[styles.filaIzquierda, styles.conPausa]}>
              {/* Pausa estilo video: ⏸ lo pausa (deja de mostrarse y el tiempo se
                  congela) y ▶ lo reanuda con lo que le quedaba. */}
              <Pressable
                onPress={() => void alternarPausa(actual)}
                disabled={pausando === actual.id}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={actual.pausado_en !== null ? 'Reanudar banner' : 'Pausar banner'}>
                <Ionicons
                  name={actual.pausado_en !== null ? 'play' : 'pause'}
                  size={22}
                  color={actual.pausado_en !== null ? Colors.accent : Colors.text}
                />
              </Pressable>
              <Pressable onPress={() => setVerRestante((v) => !v)} hitSlop={8} style={styles.filaIzquierda}>
                <Text style={styles.tiempo} numberOfLines={1}>
                  {tiempo(actual, verRestante)}
                </Text>
              </Pressable>
            </View>
            {/* V = veces que se vio; U = personas distintas que lo vieron. Se ve
                uno y tocarlo cambia al otro. */}
            <Pressable onPress={() => setVerUnicas((v) => !v)} hitSlop={8}>
              <Text
                style={styles.valor}
                accessibilityLabel={
                  verUnicas ? `${actual.vistas_unicas} personas distintas` : `${actual.vistas} veces visto`
                }>
                <Text style={styles.letra}>{verUnicas ? 'U ' : 'V '}</Text>
                {(verUnicas ? actual.vistas_unicas : actual.vistas).toLocaleString('es-CL')}
              </Text>
            </Pressable>
          </View>

          <View style={styles.fila}>
            <Text style={[actual.enlace ? styles.valor : styles.tiempo, styles.filaIzquierda]} numberOfLines={1}>
              {actual.enlace ? enlaceCorto(actual.enlace) : 'Sin enlace'}
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [styles.ubicacion, pressed && styles.pressed]}
            onPress={() => verUbicacion(actual)}
            accessibilityRole="button">
            <Text style={styles.ubicacionLabel}>Ubicación</Text>
          </Pressable>

          <Pressable
            onPress={() => handleEliminar(actual)}
            disabled={eliminando === actual.id}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Eliminar banner">
            <Text style={styles.eliminar}>{eliminando === actual.id ? 'Eliminando…' : 'Eliminar'}</Text>
          </Pressable>

          {/* Debajo de todo, no flotando encima del contenido (pedido del cliente). */}
          <BotonNuevo onPress={() => router.push('/(app)/admin/banner-nuevo')} abajo={insets.bottom} />
        </ScrollView>
      )}

      <UbicacionBanner
        visible={ubicacion !== undefined}
        comunaIds={ubicacion ?? null}
        onClose={() => setUbicacion(undefined)}
      />

      {/* Sin banners, "Nuevo" va debajo del aviso. */}
      {!loading && !error && banners.length === 0 && (
        <BotonNuevo onPress={() => router.push('/(app)/admin/banner-nuevo')} abajo={insets.bottom} />
      )}
    </SafeAreaView>
  );
}

/** "Nuevo": publicar otro banner. */
function BotonNuevo({ onPress, abajo }: { onPress: () => void; abajo: number }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.nuevo, { marginBottom: Spacing.three + abajo }, pressed && styles.nuevoPresionado]}
      onPress={onPress}>
      <Text style={styles.nuevoLabel}>Nuevo</Text>
    </Pressable>
  );
}

const margen = u(REJILLA.margenLateral);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contenido: {
    paddingBottom: Spacing.four,
  },
  marco: {
    marginHorizontal: margen,
    marginTop: Spacing.three,
    borderRadius: u(REJILLA.curvatura),
    overflow: 'hidden',
  },
  tira: {
    flexGrow: 0,
  },
  imagen: {
    // El mismo alto que en el inicio: el admin lo ve como lo ven todos.
    height: u(REJILLA.bannerAlto),
    backgroundColor: Colors.surface,
  },
  silueta: {
    backgroundColor: Colors.surface,
  },
  apagada: {
    opacity: 0.4,
  },
  cupo: {
    fontFamily: Fonts.delgada,
    fontSize: 24,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: Spacing.three,
  },
  barra: {
    flexDirection: 'row',
    height: 2,
    marginHorizontal: margen,
    backgroundColor: '#FFFFFF',
  },
  barraLlena: {
    backgroundColor: Colors.accent,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    marginHorizontal: margen * 2,
    marginTop: Spacing.four,
  },
  filaIzquierda: {
    flexShrink: 1,
  },
  tiempo: {
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.textMuted,
  },
  valor: {
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.text,
  },
  ubicacion: {
    marginHorizontal: margen * 1.5,
    marginTop: Spacing.five,
    paddingVertical: Spacing.three,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  ubicacionLabel: {
    fontFamily: Fonts.medium,
    fontSize: 22,
    color: '#000000',
  },
  pressed: {
    opacity: 0.7,
  },
  eliminar: {
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.accent,
    textAlign: 'center',
    marginTop: Spacing.four,
  },
  conPausa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  // La "V" / "U" apagada; el número, en blanco.
  letra: {
    color: Colors.textMuted,
  },
  nuevo: {
    marginHorizontal: margen,
    marginTop: Spacing.five,
    paddingVertical: Spacing.four,
    borderRadius: u(REJILLA.curvatura),
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  nuevoPresionado: {
    backgroundColor: Colors.accentPressed,
  },
  nuevoLabel: {
    fontFamily: Fonts.medium,
    fontSize: 21,
    color: '#FFFFFF',
  },
});
