import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TarjetaBanner } from '@/components/admin/TarjetaBanner';
import { TarjetaDeslizable } from '@/components/admin/TarjetaDeslizable';
import { TarjetaEliminable } from '@/components/admin/TarjetaEliminable';
import { ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { ImageViewer } from '@/components/catalog/ImageViewer';
import { PublicacionCard } from '@/components/catalog/PublicacionCard';
import { Button } from '@/components/ui/Button';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import {
  BannerDePerfil,
  BannerEnRevision,
  PublicacionEnRevision,
  aprobarBanner,
  aprobarPublicacion,
  darDeBajaPublicacion,
  fetchBannersDePerfil,
  fetchBannersPendientes,
  rechazarBanner,
  fetchPublicacionesEnRevision,
  rechazarPublicacion,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { FORMATO_RECORTE, REJILLA, u } from '@/lib/rejilla';

/**
 * Un perfil visto desde la lista de una categoría (maqueta del cliente), en
 * tarjetas como las del inicio y con el subtítulo "Comuna/Categoría":
 *
 *  - `modo=activas` (mantener presionado el nombre): sus publicaciones
 *    aprobadas. Abajo, "Banners (2)" cambia a sus banners y "Publicación"
 *    vuelve; si no tiene, dice "Sin banner" y no hace nada. "Ok" cierra.
 *    Arrastrar la parte blanca de una publicación hacia la derecha la
 *    elimina (con confirmación).
 *  - `modo=pendientes` (tocar el número junto al nombre, o su nombre en la
 *    lista "Publicación"): lo que espera aprobación, de a una y de la que más
 *    espera a la más reciente. Se revisa foto por foto (pedido del cliente):
 *    la tarjeta muestra UNA foto; "Aprobar" (o deslizar hacia arriba, o dos
 *    toques en la parte blanca) la aprueba y aparece la siguiente; al aprobar
 *    la última, la publicación queda aprobada. "No" (o deslizar a la derecha)
 *    en cualquier foto rechaza la publicación entera, y al comerciante se le
 *    dice por cuál foto fue (0039).
 *  - `modo=banners` (su nombre en la lista "Banners"): sus banners por
 *    aprobar en la comuna, igual: "Aprobar" / "No", arrastrar a la derecha
 *    rechaza y dos toques en la imagen aprueban.
 *
 * Volver atrás con el gesto del teléfono solo cierra: no rechaza nada.
 */
export default function PerfilEnTarjetasScreen() {
  const router = useRouter();
  const { usuario, comuna, categoria, titulo, modo } = useLocalSearchParams<{
    usuario: string;
    comuna: string;
    categoria: string;
    titulo?: string;
    modo?: 'activas' | 'pendientes' | 'banners';
  }>();
  const pendientes = modo === 'pendientes';
  const bannersPorAprobar = modo === 'banners';
  /** Pendientes o banners: se decide con "Aprobar" / "No". */
  const decidiendo = pendientes || bannersPorAprobar;

  const [lista, setLista] = useState<PublicacionEnRevision[]>([]);
  const [banners, setBanners] = useState<BannerDePerfil[]>([]);
  const [porAprobar, setPorAprobar] = useState<BannerEnRevision[]>([]);
  const [verBanners, setVerBanners] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  /** Fotos que faltan por ver de la pendiente en pantalla (para aprobar deslizando). */
  const [porVer, setPorVer] = useState(0);
  const [avisoFotos, setAvisoFotos] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (bannersPorAprobar) {
        setPorAprobar(await fetchBannersPendientes({ comunaId: comuna, usuarioId: usuario }));
        return;
      }
      const [publicaciones, suyos] = await Promise.all([
        fetchPublicacionesEnRevision({
          usuarioId: usuario,
          comunaId: comuna,
          categoriaId: categoria,
          estado: pendientes ? 'pendiente' : 'aprobado',
        }),
        pendientes ? Promise.resolve([]) : fetchBannersDePerfil(usuario, comuna),
      ]);
      // De la más antigua a la más reciente: lo que lleva más tiempo, primero.
      setLista([...publicaciones].reverse());
      setBanners(suyos);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudieron cargar sus publicaciones.'));
    } finally {
      setLoading(false);
    }
  }, [usuario, comuna, categoria, pendientes, bannersPorAprobar]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /** Aprobar o rechazar la que está en pantalla; sin más pendientes, se vuelve a la lista. */
  async function decidir(p: PublicacionEnRevision, aprobar: boolean, foto?: number) {
    const resto = lista.filter((x) => x.id !== p.id);
    setLista(resto);
    try {
      await (aprobar ? aprobarPublicacion(p.id) : rechazarPublicacion(p.id, foto));
      if (resto.length === 0) router.back();
    } catch (err) {
      setLista((l) => (l.some((x) => x.id === p.id) ? l : [p, ...l]));
      Alert.alert(aprobar ? 'No se pudo aprobar' : 'No se pudo rechazar', getErrorMessage(err, 'Intenta de nuevo.'));
    }
  }

  /** Igual, para un banner. */
  async function decidirBanner(b: BannerEnRevision, aprobar: boolean) {
    const resto = porAprobar.filter((x) => x.id !== b.id);
    setPorAprobar(resto);
    try {
      await (aprobar ? aprobarBanner(b.id) : rechazarBanner(b.id));
      if (resto.length === 0) router.back();
    } catch (err) {
      setPorAprobar((l) => (l.some((x) => x.id === b.id) ? l : [b, ...l]));
      Alert.alert(aprobar ? 'No se pudo aprobar' : 'No se pudo rechazar', getErrorMessage(err, 'Intenta de nuevo.'));
    }
  }

  const actual = lista[0];
  const bannerActual = porAprobar[0];
  // Foto por foto: cuántas fotos de la publicación en pantalla ya se aprobaron.
  const [aprobadas, setAprobadas] = useState(0);
  useEffect(() => {
    setAprobadas(0);
  }, [actual?.id]);
  const totalFotos = actual?.productos.length ?? 0;
  // La tarjeta muestra solo la foto que toca aprobar, no la galería entera.
  const fotoActual = useMemo(() => {
    if (!actual || totalFotos === 0) return actual;
    const ordenados = [...actual.productos].sort((a, b) => a.orden - b.orden);
    return { ...actual, productos: [ordenados[Math.min(aprobadas, ordenados.length - 1)]] };
  }, [actual, totalFotos, aprobadas]);
  /** Lo que hacen "Aprobar" y "No" con lo que está en pantalla. */
  const aprobarActual = (aprobar: boolean) => {
    if (bannersPorAprobar) {
      if (bannerActual) void decidirBanner(bannerActual, aprobar);
    } else if (actual) {
      // Aprobar pasa a la foto siguiente; la última aprueba la publicación.
      // Rechazar rechaza la publicación entera, diciendo por cuál foto.
      if (aprobar && aprobadas + 1 < totalFotos) setAprobadas((a) => a + 1);
      else void decidir(actual, aprobar, aprobar || totalFotos === 0 ? undefined : aprobadas + 1);
    }
  };
  const hayActual = bannersPorAprobar ? Boolean(bannerActual) : Boolean(actual);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <EncabezadoMarca subtitulo={`${titulo ?? ''}${pendientes ? '(P)' : ''}`} />

      <View style={styles.cuerpo}>
        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && pendientes && (
          <View style={styles.centrado}>
            {actual ? (
              <>
                <TarjetaDeslizable
                  // Una tarjeta nueva por foto: así vuelve a su lugar tras deslizarla.
                  key={`${actual.id}-${aprobadas}`}
                  onRechazar={() => aprobarActual(false)}
                  onAprobar={() => aprobarActual(true)}
                  puedeAprobar={porVer === 0}
                  onAprobarBloqueado={() => {
                    setAvisoFotos(true);
                    setTimeout(() => setAvisoFotos(false), 2500);
                  }}>
                  <PublicacionCard
                    key={`${actual.id}-${aprobadas}`}
                    publicacion={fotoActual ?? actual}
                    onFotosPorVer={setPorVer}
                    onContactar={() => {}}
                    onVerFoto={setFoto}
                    onDobleToquePanel={() => aprobarActual(true)}
                    fotosPorAprobar={Math.max(0, totalFotos - aprobadas)}
                  />
                </TarjetaDeslizable>
                {avisoFotos && (
                  <Text style={styles.aviso}>
                    {porVer === 1 ? 'Falta 1 foto por ver' : `Faltan ${porVer} fotos por ver`} antes de aprobar deslizando.
                  </Text>
                )}
              </>
            ) : (
              <Text style={styles.vacio}>No tiene publicaciones esperando aprobación.</Text>
            )}
          </View>
        )}

        {/* El banner arriba, como en el inicio (maqueta del cliente). */}
        {!loading && !error && bannersPorAprobar && (
          <View style={styles.listaBanners}>
            {bannerActual ? (
              <TarjetaDeslizable
                key={bannerActual.id}
                onRechazar={() => decidirBanner(bannerActual, false)}
                onAprobar={() => decidirBanner(bannerActual, true)}
                soloRechazar>
                <TarjetaBanner banner={bannerActual} onDobleToque={() => decidirBanner(bannerActual, true)} />
              </TarjetaDeslizable>
            ) : (
              <Text style={styles.vacio}>No tiene banners esperando aprobación.</Text>
            )}
          </View>
        )}

        {!loading && !error && !decidiendo && !verBanners && (
          <ScrollView contentContainerStyle={styles.lista} showsVerticalScrollIndicator={false}>
            {lista.length === 0 && <Text style={styles.vacio}>No tiene publicaciones activas aquí.</Text>}
            {lista.map((p) => (
              <TarjetaEliminable
                key={p.id}
                publicacion={p}
                onVerFoto={setFoto}
                onEliminar={async () => {
                  try {
                    await darDeBajaPublicacion(p.id);
                    setLista((l) => l.filter((x) => x.id !== p.id));
                  } catch (err) {
                    Alert.alert('No se pudo eliminar', getErrorMessage(err, 'Intenta de nuevo.'));
                    throw err;
                  }
                }}
              />
            ))}
          </ScrollView>
        )}

        {!loading && !error && !decidiendo && verBanners && (
          <ScrollView contentContainerStyle={styles.listaBanners} showsVerticalScrollIndicator={false}>
            {banners.map((b) => (
              <Pressable key={b.id} onPress={() => setFoto(b.imagen_url)}>
                <Image source={{ uri: b.imagen_url }} style={styles.banner} contentFit="cover" />
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {!loading && !error && (
        <View style={styles.pie}>
          {decidiendo ? (
            <>
              <Button label="Aprobar" onPress={() => aprobarActual(true)} disabled={!hayActual} />
              <Pressable
                onPress={() => aprobarActual(false)}
                disabled={!hayActual}
                hitSlop={10}
                accessibilityRole="button">
                <Text style={styles.enlace}>No</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Button label="Ok" onPress={() => router.back()} />
              {verBanners ? (
                <Pressable onPress={() => setVerBanners(false)} hitSlop={10} accessibilityRole="button">
                  <Text style={styles.enlace}>Publicación</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => setVerBanners(true)}
                  disabled={banners.length === 0}
                  hitSlop={10}
                  accessibilityRole="button">
                  <Text style={styles.enlace}>{banners.length > 0 ? `Banners (${banners.length})` : 'Sin banner'}</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      )}

      <ImageViewer images={foto ? [foto] : []} visible={foto !== null} initialIndex={0} onClose={() => setFoto(null)} />
    </SafeAreaView>
  );
}

const margen = u(REJILLA.margenLateral);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  cuerpo: {
    flex: 1,
  },
  centrado: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: margen,
  },
  // Una sola tarjeta queda al centro, como en la maqueta; con varias, se desliza.
  lista: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: margen,
    paddingVertical: margen,
    gap: margen,
  },
  listaBanners: {
    paddingHorizontal: margen,
    paddingVertical: margen,
    gap: margen,
  },
  banner: {
    width: '100%',
    aspectRatio: FORMATO_RECORTE.banner[0] / FORMATO_RECORTE.banner[1],
    borderRadius: u(REJILLA.curvatura),
    backgroundColor: Colors.surface,
  },
  pie: {
    paddingHorizontal: margen,
    paddingBottom: Spacing.three,
    gap: Spacing.three,
    alignItems: 'stretch',
  },
  enlace: {
    fontFamily: Fonts.delgada,
    fontSize: 26,
    color: Colors.text,
    textAlign: 'center',
  },
  aviso: {
    fontFamily: Fonts.medium,
    fontSize: 15,
    color: Colors.accent,
    textAlign: 'center',
    marginTop: Spacing.three,
  },
  vacio: {
    fontFamily: Fonts.delgada,
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
