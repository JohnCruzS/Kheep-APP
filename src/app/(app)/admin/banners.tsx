import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
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
import { BotonPie } from '@/components/ui/BotonPie';
import { EncabezadoMarca, useHuecoHastaBanner } from '@/components/ui/EncabezadoMarca';
import { AjusteAPantalla } from '@/components/ui/AjusteAPantalla';
import { MedioBanner } from '@/components/catalog/MedioBanner';
import { Ionicons } from '@expo/vector-icons';
import { UbicacionBanner } from '@/components/admin/UbicacionBanner';
import { SelectorZonas } from '@/components/admin/SelectorZonas';
import { EditorPantalla } from '@/components/admin/EditorPantalla';
import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { bannersEnMemoria, precargarBanners } from '@/lib/cacheAdmin';
import {
  BannerAdmin,
  ComunaAdmin,
  cambiarEnlaceBanner,
  cambiarUbicacionBanner,
  fetchComunasAdmin,
  pausarBanner,
  eliminarBanner,
  purgarMediosVencidos,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { REJILLA, u } from '@/lib/rejilla';
import { useSession } from '@/providers/SessionProvider';

const HORA = 3600000;
const DIA = 24 * HORA;

const dos = (n: number) => String(n).padStart(2, '0');

/**
 * Cuánto del tiempo contratado ya pasó (0 a 1), para la línea de avance
 * estilo video. En pausa queda quieta.
 */
function progreso(banner: BannerAdmin): number {
  if (!banner.fecha_fin) return 0;
  const fin = new Date(banner.fecha_fin).getTime();
  const inicio = banner.fecha_inicio ? new Date(banner.fecha_inicio).getTime() : null;
  const ahora = banner.pausado_en ? new Date(banner.pausado_en).getTime() : Date.now();
  const contratado = banner.horas
    ? banner.horas * HORA
    : banner.dias
      ? banner.dias * DIA
      : inicio !== null
        ? fin - inicio
        : null;
  if (!contratado) return 0;
  return Math.max(0, Math.min(1, (contratado - Math.max(0, fin - ahora)) / contratado));
}

/** "3  10 : 20 : 16": días y, después, horas, minutos y segundos. */
function restante(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  return `${d}  ${dos(Math.floor((s % 86400) / 3600))} : ${dos(Math.floor((s % 3600) / 60))} : ${dos(s % 60)}`;
}

const dias = (n: number) => `${n} ${n === 1 ? 'Día' : 'Días'}`;

/**
 * El tiempo del banner, con los formatos de la maqueta del cliente (se pasa
 * de uno a otro tocándolo):
 *  - restante: cuánto le queda, "3  10 : 20 : 16" (días, horas, minutos y
 *    segundos);
 *  - avance, si se contrató por horas (el admin): "24 : 21 / 48 : 00"
 *    (horas y minutos que lleva, de las horas contratadas);
 *  - avance, si se contrató por días (los comerciantes): "2 Días / 4 Días".
 *
 * El avance se cuenta como lo contratado menos lo que le queda: así no suma
 * el tiempo que estuvo en pausa (al reanudar, el término se corre lo que duró
 * la pausa).
 */
function tiempo(banner: BannerAdmin, verRestante: boolean): string {
  if (!banner.fecha_fin) return 'Sin vencimiento';
  const fin = new Date(banner.fecha_fin).getTime();
  const inicio = banner.fecha_inicio ? new Date(banner.fecha_inicio).getTime() : null;
  // En pausa, el reloj queda detenido en el momento en que se pausó.
  const ahora = banner.pausado_en ? new Date(banner.pausado_en).getTime() : Date.now();
  if (fin <= ahora) return 'Terminado';
  const queda = fin - ahora;

  // Lo contratado: las horas o los días; sin ese dato (banners antiguos), lo
  // que va de la fecha de inicio a la de término.
  const contratado = banner.horas
    ? banner.horas * HORA
    : banner.dias
      ? banner.dias * DIA
      : inicio !== null
        ? fin - inicio
        : null;
  if (verRestante || contratado === null) return restante(queda);

  const llevado = Math.min(contratado, Math.max(0, contratado - queda));
  if (banner.horas) {
    const minutos = Math.floor(llevado / 60000);
    return `${dos(Math.floor(minutos / 60))} : ${dos(minutos % 60)} / ${dos(banner.horas)} : 00`;
  }
  return `${dias(Math.floor(llevado / DIA))} / ${dias(Math.round(contratado / DIA))}`;
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
  // El banner, a la misma altura y del mismo tamaño que en el inicio.
  const huecoBanner = useHuecoHastaBanner();
  const insets = useSafeAreaInsets();
  const { permisos, session } = useSession();
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
  /** Cambiar las comunas de un banner propio, y el enlace. */
  const [editandoZonas, setEditandoZonas] = useState(false);
  const [zonasElegidas, setZonasElegidas] = useState<string[]>([]);
  const [editandoEnlace, setEditandoEnlace] = useState(false);
  const [comunas, setComunas] = useState<ComunaAdmin[]>([]);
  useEffect(() => {
    fetchComunasAdmin()
      .then(setComunas)
      .catch(() => setComunas([]));
  }, []);
  // Las que esta cuenta puede elegir: el de zona, solo las suyas.
  const disponibles = useMemo(
    () => (permisos?.esGeneral ? comunas : comunas.filter((c) => permisos?.comunas.includes(c.id))),
    [comunas, permisos],
  );
  // El tiempo se redibuja cada segundo: congelado no dice nada.
  const [, setTic] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTic((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Los GIF y videos vencidos se borran solos (con su archivo) para no
      // ocupar espacio; si falla, no importa: se intenta la próxima vez.
      await purgarMediosVencidos().catch(() => 0);
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
  /**
   * Pausar o reanudar al instante (antes esperaba al servidor y además
   * recargaba toda la lista, y se notaba lento): el cambio se ve de inmediato,
   * se guarda por detrás y, si falla, se deshace avisando. Al reanudar, el
   * vencimiento se corre lo que estuvo en pausa, igual que hace la base.
   */
  async function alternarPausa(banner: BannerAdmin) {
    const pausar = banner.pausado_en === null;
    const ahora = new Date();
    const cambiado: BannerAdmin = pausar
      ? { ...banner, pausado_en: ahora.toISOString() }
      : {
          ...banner,
          pausado_en: null,
          fecha_fin:
            banner.fecha_fin && banner.pausado_en
              ? new Date(
                  new Date(banner.fecha_fin).getTime() + (ahora.getTime() - new Date(banner.pausado_en).getTime()),
                ).toISOString()
              : banner.fecha_fin,
        };
    setBanners((lista) => lista.map((b) => (b.id === banner.id ? cambiado : b)));
    setPausando(banner.id);
    try {
      await pausarBanner(banner.id, pausar);
    } catch (err) {
      setBanners((lista) => lista.map((b) => (b.id === banner.id ? banner : b)));
      setPausando(null);
      Alert.alert(pausar ? 'No se pudo pausar' : 'No se pudo reanudar', getErrorMessage(err, 'Intenta de nuevo.'));
      return;
    }
    setPausando(null);
    // Ya quedó guardado: se traen los datos exactos de la base, sin volver a
    // mostrar la carga. Si esto falla, lo de pantalla ya es correcto.
    // Se conserva el orden que se está viendo (pausar no mueve nada).
    precargarBanners()
      .then((lista) =>
        setBanners((actuales) => {
          const posicion = new Map(actuales.map((b, i) => [b.id, i]));
          return filtrar(lista).sort(
            (a, b) => (posicion.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (posicion.get(b.id) ?? Number.MAX_SAFE_INTEGER),
          );
        }),
      )
      .catch(() => {});
  }

  /**
   * Ubicación: dónde se muestra. Un banner publicado en varias comunas son
   * varias copias con la misma imagen; se juntan todas las comunas de esas
   * copias. Una copia para "todas las comunas" las enciende todas.
   */
  function verUbicacion(banner: BannerAdmin) {
    const copias = banners.filter((b) => b.imagen_url === banner.imagen_url);
    const enTodas = copias.some((b) => b.comuna_id === null);
    // Los propios se pueden cambiar (pedido del cliente): se abre el mismo
    // selector que al crearlos. Los de otros, solo se miran.
    if (banner.usuario_id === session?.user.id) {
      setZonasElegidas(enTodas ? disponibles.map((c) => c.id) : copias.map((b) => b.comuna_id as string));
      setEditandoZonas(true);
      return;
    }
    setUbicacion(enTodas ? null : copias.map((b) => b.comuna_id as string));
  }

  async function guardarZonas(ids: string[]) {
    setEditandoZonas(false);
    if (!actual) return;
    if (ids.length === 0) {
      Alert.alert('Elige al menos una comuna', 'Para sacarlo de todas, usa "Eliminar".');
      return;
    }
    // El general con todo encendido: UNA copia para todas las comunas, como al crearlo.
    const todas = permisos?.esGeneral && disponibles.length > 0 && disponibles.every((c) => ids.includes(c.id));
    try {
      await cambiarUbicacionBanner(actual.id, todas ? [null] : ids);
      await load();
    } catch (err) {
      Alert.alert('No se pudo cambiar la ubicación', getErrorMessage(err, 'Intenta de nuevo.'));
    }
  }

  /** Abre el enlace del banner, para ver que lleva a donde debe. */
  function abrirEnlace(enlace: string) {
    const url = /^https?:\/\//i.test(enlace) ? enlace : `https://${enlace}`;
    Linking.openURL(url).catch(() => Alert.alert('No se pudo abrir el enlace', 'Revisa que esté bien escrito.'));
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
  // La línea de avance, como la de un video: cuánto del tiempo contratado
  // del banner que se ve ya pasó (pedido del cliente).
  const avance = actual ? progreso(actual) : 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false, animation: 'fade' }} />
      {/* Dos toques en el título: los precios por región y comuna (solo el general). */}
      <EncabezadoMarca
        subtitulo="Banners"
        onDobleToque={permisos?.esGeneral ? () => router.replace('/(app)/admin/precios-banner') : undefined}
      />

      {loading && <View style={[styles.marco, { marginTop: huecoBanner }, styles.imagen, styles.silueta]} />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && banners.length === 0 && (
        <EmptyState title="No hay banners publicados" message="Cuando haya banners en la app, aparecerán acá." />
      )}

      {/* Solo la imagen se desliza; los datos de abajo pasan a ser los del
          banner que se está mirando. Va fuera del ajuste de abajo para que
          nunca se achique: queda igual que en el inicio. */}
      {!loading && !error && banners.length > 0 && actual && (
          <View style={[styles.marco, { marginTop: huecoBanner }]} onLayout={medirAncho}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={alDeslizar}
              onMomentumScrollEnd={alDeslizar}
              scrollEventThrottle={16}
              style={styles.tira}>
              {banners.map((banner, i) => (
                <MedioBanner
                  key={banner.id}
                  uri={banner.imagen_url}
                  ancho={ancho}
                  style={[styles.imagen, { width: ancho }, banner.pausado_en !== null && styles.apagada]}
                  activo={i === indice}
                />
              ))}
            </ScrollView>
          </View>
      )}

      {!loading && !error && banners.length > 0 && actual && (
        // Sin deslizar: en una pantalla baja se achica para que quepa todo.
        <AjusteAPantalla style={styles.contenido}>
          {/* Cuál se está viendo de cuántos hay: "3/6". */}
          <Text style={styles.cupo}>
            {indice + 1}/{banners.length}
          </Text>

          {/* Por dónde va el carrusel: crece con cada banner, entera en el último. */}
          <View style={styles.barra}>
            <View style={styles.barraFondo} />
            <View style={[styles.barraLlena, { width: `${avance * 100}%` }]} />
            {/* El punto, donde va el avance, como en un video. */}
            <View style={[styles.barraPunto, { left: `${avance * 100}%` }]} />
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

          {/* El enlace: un toque lo abre (para comprobar que está bien) y
              mantenerlo apretado lo cambia, en el editor de siempre. */}
          <Pressable
            style={styles.fila}
            onPress={actual.enlace ? () => abrirEnlace(actual.enlace!) : undefined}
            onLongPress={() => setEditandoEnlace(true)}
            delayLongPress={400}
            accessibilityRole="button"
            accessibilityHint="Toca para abrir el enlace; mantén apretado para cambiarlo">
            <Text style={[actual.enlace ? styles.valor : styles.tiempo, styles.filaIzquierda]} numberOfLines={1}>
              {actual.enlace ? enlaceCorto(actual.enlace) : 'Sin enlace'}
            </Text>
          </Pressable>

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

        </AjusteAPantalla>
      )}

      <UbicacionBanner
        visible={ubicacion !== undefined}
        comunaIds={ubicacion ?? null}
        onClose={() => setUbicacion(undefined)}
      />

      {/* Los propios se cambian de comunas, como al crearlos. */}
      <SelectorZonas
        visible={editandoZonas}
        comunas={disponibles}
        elegidas={zonasElegidas}
        onClose={() => setEditandoZonas(false)}
        onListo={(ids) => void guardarZonas(ids)}
      />

      <EditorPantalla
        visible={editandoEnlace}
        subtitulo="Enlace"
        placeholder="Enlace"
        inicial={actual?.enlace ?? ''}
        propsCampo={{ keyboardType: 'url', autoCapitalize: 'none', autoCorrect: false }}
        validar={(v) => (!v.trim() || /^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i.test(v.trim()) ? null : 'Escribe un enlace válido.')}
        onCerrar={() => setEditandoEnlace(false)}
        onGuardar={async (v) => {
          if (!actual) return;
          await cambiarEnlaceBanner(actual.imagen_url, v);
          const enlace = v.trim() ? v.trim() : null;
          setBanners((lista) => lista.map((b) => (b.imagen_url === actual.imagen_url ? { ...b, enlace } : b)));
        }}
      />

      {/* Sin banners (o cargando), el espacio libre empuja "Nuevo" hasta abajo. */}
      {!(banners.length > 0 && actual) && <View style={styles.relleno} />}

      {/* "Nuevo", abajo y a la misma altura que en las demás vistas. */}
      {!loading && !error && <BotonPie label="Nuevo" onPress={() => router.push('/(app)/admin/banner-nuevo')} />}
    </SafeAreaView>
  );
}

const margen = u(REJILLA.margenLateral);

const styles = StyleSheet.create({
  relleno: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contenido: {
    paddingBottom: Spacing.four,
  },
  marco: {
    marginHorizontal: margen,
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
  // La línea de avance, como la de un video: fondo blanco, lo que pasó en
  // rojo y un punto rojo donde va.
  barra: {
    height: 12,
    marginHorizontal: margen,
    justifyContent: 'center',
  },
  barraFondo: {
    height: 2,
    backgroundColor: '#FFFFFF',
  },
  barraLlena: {
    position: 'absolute',
    left: 0,
    height: 2,
    backgroundColor: Colors.accent,
  },
  barraPunto: {
    position: 'absolute',
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
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
