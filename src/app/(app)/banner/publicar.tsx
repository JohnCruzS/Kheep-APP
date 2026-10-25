import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/ui/Texto';
import { BotonPie } from '@/components/ui/BotonPie';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { SelectorComunasBanner } from '@/components/banner/SelectorComunasBanner';
import { Button } from '@/components/ui/Button';
import { FormScroll } from '@/components/ui/FormScroll';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import {
  Comuna,
  MiBanner,
  PreciosBanner,
  fetchPreciosBanner,
  precioBannerEn,
  CUPO_BANNERS,
  contarBannersVigentes,
  crearBanners,
  fetchComunas,
  fetchMisBanners,
  pagarBanner,
  reenviarBanner,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { PickedImage, pickAndCompressImage, uploadCompressedImage } from '@/lib/images';
import { compararRegiones, nombreRegion } from '@/lib/regiones';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/SessionProvider';
import { FORMATO_RECORTE, REJILLA, u } from '@/lib/rejilla';
import { FotoRemota } from '@/components/ui/FotoRemota';

const OPCIONES_DIAS = [3, 7, 15, 30];
/** Tope de la duración a medida: un año. Más que eso es un error de tecleo. */
const DIAS_MAX = 365;

export default function PublicarBannerScreen() {
  const router = useRouter();
  const { session, profile, permisos } = useSession();
  const esAdmin = profile?.rol === 'admin';
  // Administrador de zona: publica sin pagar, igual que el general, pero solo
  // en una comuna suya y sin la prioridad del carrusel.
  const esZona = profile?.rol === 'admin_zona';

  const [misBanners, setMisBanners] = useState<MiBanner[]>([]);
  // Con la migración 0037 el banner de un comerciante pasa por revisión antes
  // de pagarse; sin ella se sigue como antes (se paga y se activa al tiro).
  const [conRevision, setConRevision] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [comunas, setComunas] = useState<Comuna[]>([]);
  /** Precios por día de cada región y comuna (0043). */
  const [precios, setPrecios] = useState<PreciosBanner | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  const [imagen, setImagen] = useState<PickedImage | null>(null);
  // Las comunas donde se muestra: se eligen por región o sueltas, con
  // interruptores (documento EDIT APP).
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dias, setDias] = useState(3);
  /** A dónde lleva tocar el banner. Opcional (documento EDIT APP). */
  const [enlace, setEnlace] = useState('');
  // La duración a medida se escribe aparte: mientras el campo está vacío o a
  // medio escribir no se puede calcular el precio, y `dias` tiene que seguir
  // teniendo un número válido.
  const [diasLibres, setDiasLibres] = useState('');
  const [aMedida, setAMedida] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async () => {
    setLoadingList(true);
    try {
      const [banners, comunasData, p] = await Promise.all([fetchMisBanners(), fetchComunas(), fetchPreciosBanner()]);
      setPrecios(p);
      setMisBanners(banners.banners);
      setConRevision(banners.conRevision);
      setComunas(comunasData);
      // Los administradores parten con todo lo suyo prendido (el general, el
      // país entero) y apagan donde no va; un comerciante parte de cero.
      if (esAdmin) setElegidas(comunasData.map((c) => c.id));
      else if (esZona) setElegidas(comunasData.filter((c) => permisos?.comunas.includes(c.id)).map((c) => c.id));
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudieron cargar tus banners.'));
    } finally {
      setLoadingList(false);
    }
  }, [esAdmin, esZona, permisos]);

  // Solo lo que esta cuenta puede elegir: el de zona, sus comunas.
  const disponibles = useMemo(
    () => (esZona ? comunas.filter((c) => permisos?.comunas.includes(c.id)) : comunas),
    [comunas, esZona, permisos],
  );
  // El general con todo prendido publica UN banner para todas las comunas
  // (también las que se activen después), no uno por cada una.
  const todoElPais = esAdmin && disponibles.length > 0 && elegidas.length === disponibles.length;
  const destinos: (string | null)[] = todoElPais ? [null] : elegidas;

  useEffect(() => {
    if (session) cargar();
  }, [session, cargar]);

  async function handlePickImagen() {
    try {
      const image = await pickAndCompressImage({ uso: 'banner' });
      if (image) setImagen(image);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo abrir la galería.'));
    }
  }

  async function handlePublicar() {
    setError(null);
    setSuccess(null);

    if (!imagen) {
      setError('Sube una imagen para el banner.');
      return;
    }

    if (elegidas.length === 0) {
      setError('Elige al menos una comuna donde se muestre.');
      return;
    }

    if (dias < 1 || dias > DIAS_MAX) {
      setError(`La duración tiene que estar entre 1 y ${DIAS_MAX} días.`);
      return;
    }

    // Un enlace mal escrito no abre nada y nadie se entera: se avisa acá, no
    // después de cobrar.
    const enlaceEscrito = enlace.trim();
    if (enlaceEscrito && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+\S*$/i.test(enlaceEscrito)) {
      setError('El enlace no es válido (por ejemplo: www.kheep.cl).');
      return;
    }
    const enlaceLimpio =
      enlaceEscrito && !/^https?:\/\//i.test(enlaceEscrito) ? `https://${enlaceEscrito}` : enlaceEscrito;

    // El carrusel tiene cupo: con más banners de la cuenta, ninguno alcanza a
    // verse. Se comprueba antes de cobrar.
    try {
      const ocupados = await Promise.all(destinos.map((id) => contarBannersVigentes(id)));
      const llenas = destinos.filter((_, i) => ocupados[i] >= CUPO_BANNERS);
      if (llenas.length > 0) {
        const nombres = llenas.map((id) => (id ? (comunas.find((c) => c.id === id)?.nombre ?? '') : 'todas las comunas'));
        setError(
          `Ya hay ${CUPO_BANNERS} banners mostrándose en ${nombres.slice(0, 3).join(', ')}` +
            (nombres.length > 3 ? ` y ${nombres.length - 3} más` : '') +
            '. Apágalas o espera a que termine alguno.',
        );
        return;
      }
    } catch {
      // Si no se puede comprobar el cupo, se deja publicar: el banner está
      // pagado y bloquearlo por una consulta que falló sería peor.
    }

    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const imagenUrl = await uploadCompressedImage('banners', auth.user!.id, imagen, `banner-${Date.now()}`);
      const ids = await crearBanners({
        imagenUrl,
        comunaIds: destinos,
        dias,
        enlace: enlaceLimpio || null,
        pagado: esAdmin || esZona,
        prioritario: esAdmin,
      });

      if (!esAdmin && !esZona && conRevision) {
        setSuccess('¡Listo! Tu banner quedó en revisión. Cuando lo aprueben, se publica.');
      } else if (!esAdmin && !esZona) {
        for (const id of ids) await pagarBanner(id);
        setSuccess(`¡Listo! Pagaste $${precio.toLocaleString('es-CL')} y tu banner ya está activo.`);
      } else {
        setSuccess('¡Listo! Tu banner ya está activo.');
      }

      setImagen(null);
      if (!esAdmin && !esZona) setElegidas([]);
      setDias(3);
      setEnlace('');
      cargar();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo publicar el banner.'));
    } finally {
      setSaving(false);
    }
  }

  /** Pagar (simulado) un banner ya aprobado: se activa por sus días. */
  async function handlePagar(banner: MiBanner) {
    setError(null);
    setSuccess(null);
    setOcupado(banner.id);
    try {
      await pagarBanner(banner.id);
      setSuccess('¡Listo! Tu banner ya está activo.');
      await cargar();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo pagar el banner.'));
    } finally {
      setOcupado(null);
    }
  }

  /** Rechazado: se elige otra imagen (obligatorio) y vuelve a revisión. */
  async function handleReenviar(banner: MiBanner) {
    setError(null);
    setSuccess(null);
    try {
      const nueva = await pickAndCompressImage({ uso: 'banner' });
      if (!nueva) return;
      setOcupado(banner.id);
      const { data: auth } = await supabase.auth.getUser();
      const url = await uploadCompressedImage('banners', auth.user!.id, nueva, `banner-${Date.now()}`);
      await reenviarBanner(banner.id, url);
      setSuccess('Reenviado: tu banner volvió a revisión.');
      await cargar();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo reenviar el banner.'));
    } finally {
      setOcupado(null);
    }
  }

  const comunaElegida = resumirZona(elegidas, disponibles, todoElPais);
  // Un comerciante paga los días por el precio de cada comuna donde aparece
  // (el de la comuna, el de su región o el base; ver 0043).
  const precioDe = (comunaId: string | null) => {
    const c = comunas.find((x) => x.id === comunaId);
    return precioBannerEn({ id: comunaId ?? '', region: c?.region }, precios);
  };
  // Ejemplo: dos comunas de $20.000 por 5 días = $200.000. Sin comunas, $0.
  const precio = dias * elegidas.reduce((suma, id) => suma + precioDe(id), 0);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      <EncabezadoMarca subtitulo="Banners" onVolver={() => router.back()} />

      {/* Maqueta del cliente: la foto como vista previa, el enlace, la
          ubicación, los días y, abajo, el botón con lo que se paga (los días
          por la suma del precio de cada comuna elegida). "Mis banners", al
          final de todo. */}
      <FormScroll contentContainerStyle={styles.content}>
        <Pressable onPress={handlePickImagen} style={styles.foto} accessibilityRole="button" accessibilityLabel="Subir imagen">
          {imagen ? (
            <Image source={{ uri: imagen.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <Text style={styles.subir}>Subir</Text>
          )}
        </Pressable>

        <TextInput
          value={enlace}
          onChangeText={setEnlace}
          placeholder="Enlace"
          placeholderTextColor={Colors.text}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.enlace}
        />

        <Pressable
          style={({ pressed }) => [styles.ubicacion, pressed && styles.presionado]}
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button">
          <Text style={styles.ubicacionLabel}>Ubicación</Text>
        </Pressable>
        {comunaElegida ? (
          <Text style={styles.resumen} numberOfLines={1}>
            {comunaElegida}
          </Text>
        ) : null}

        <Text style={styles.duracion}>Duración / Días</Text>
        <View style={styles.paso}>
          <Pressable onPress={() => setDias((d) => Math.max(1, d - 1))} hitSlop={12} accessibilityLabel="Menos días">
            <Text style={styles.pasoSigno}>-</Text>
          </Pressable>
          <Text style={styles.pasoValor}>{dias}</Text>
          <Pressable onPress={() => setDias((d) => Math.min(DIAS_MAX, d + 1))} hitSlop={12} accessibilityLabel="Más días">
            <Text style={styles.pasoSigno}>+</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {success ? <Text style={styles.successText}>{success}</Text> : null}

        {/* "Mis banners", debajo de todo (pedido del cliente). */}
        {!esAdmin && !esZona && !loadingList && misBanners.length > 0 && (
          <View style={styles.misBannersSection}>
            <Text style={styles.sectionLabel}>MIS BANNERS</Text>
            {misBanners.map((banner) => (
              <View key={banner.id} style={styles.miBannerRow}>
                <FotoRemota uri={banner.imagen_url} ancho={64} style={styles.miBannerThumb} />
                <View style={styles.miBannerInfo}>
                  <Text style={styles.miBannerComuna}>{banner.comuna?.nombre ?? 'Todas las comunas'}</Text>
                  <EstadoBanner banner={banner} />
                </View>
                {ocupado === banner.id ? (
                  <ActivityIndicator color={Colors.accent} />
                ) : banner.estado === 'rechazado' ? (
                  <Pressable onPress={() => handleReenviar(banner)} hitSlop={8}>
                    <Text style={styles.accionBanner}>Cambiar imagen</Text>
                  </Pressable>
                ) : banner.estado === 'aprobado' && !banner.pagado ? (
                  <Pressable onPress={() => handlePagar(banner)} hitSlop={8}>
                    <Text style={styles.accionBanner}>
                      Pagar ${((banner.dias ?? 7) * precioDe(banner.comuna_id)).toLocaleString('es-CL')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </FormScroll>

      {/* Lo que se paga, en el botón rojo de abajo: mismo tamaño y misma
          altura que en las demás vistas (pedido del cliente). */}
      <BotonPie
        label={esAdmin || esZona ? 'Publicar' : `$ ${precio.toLocaleString('es-CL')}`}
        onPress={handlePublicar}
        cargando={saving}
      />

      <SelectorComunasBanner
        visible={pickerOpen}
        comunas={disponibles}
        elegidas={elegidas}
        dias={dias}
        precioDe={(id) => precioDe(id)}
        onClose={() => setPickerOpen(false)}
        onListo={(ids) => {
          setElegidas(ids);
          setPickerOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

/** Cómo se lee lo elegido en el campo: "Todas las comunas", regiones enteras o comunas. */
function resumirZona(elegidas: string[], disponibles: Comuna[], todoElPais: boolean): string {
  if (elegidas.length === 0) return '';
  if (todoElPais) return 'Todas las comunas';
  const set = new Set(elegidas);
  const porRegion = new Map<string, Comuna[]>();
  for (const c of disponibles) {
    const lista = porRegion.get(c.region ?? '') ?? [];
    lista.push(c);
    porRegion.set(c.region ?? '', lista);
  }
  const partes: string[] = [];
  for (const [region, lista] of [...porRegion.entries()].sort(([a], [b]) => compararRegiones(a, b))) {
    const prendidas = lista.filter((c) => set.has(c.id));
    if (prendidas.length === 0) continue;
    if (prendidas.length === lista.length && lista.length > 1) partes.push(nombreRegion(region));
    else partes.push(...prendidas.map((c) => c.nombre));
  }
  return partes.length <= 3 ? partes.join(', ') : `${partes.slice(0, 2).join(', ')} y ${partes.length - 2} más`;
}

function EstadoBanner({ banner }: { banner: MiBanner }) {
  if (banner.estado === 'pendiente') {
    return <Text style={[styles.estadoLabel, styles.estadoPendiente]}>En revisión</Text>;
  }
  if (banner.estado === 'rechazado') {
    return <Text style={[styles.estadoLabel, styles.estadoRechazado]}>Rechazado: cambia la imagen y reenvíalo</Text>;
  }
  // "pagado" solo aplica a un comerciante — un banner de admin queda activo
  // sin pasar por ahí, así que lo que de verdad importa para mostrar el
  // estado es `activo`, no `pagado` (ver fn_banner_defaults en la 0012).
  if (!banner.activo && !banner.pagado) {
    return <Text style={[styles.estadoLabel, styles.estadoPendiente]}>Aprobado · pendiente de pago</Text>;
  }
  if (banner.activo && banner.fecha_fin) {
    const fecha = new Date(banner.fecha_fin);
    const vencido = fecha.getTime() < Date.now();
    if (vencido) {
      return <Text style={[styles.estadoLabel, styles.estadoVencido]}>Vencido</Text>;
    }
    return (
      <Text style={[styles.estadoLabel, styles.estadoActivo]}>
        Activo hasta {fecha.toLocaleDateString('es-CL')}
      </Text>
    );
  }
  return <Text style={[styles.estadoLabel, styles.estadoVencido]}>Vencido</Text>;
}

const styles = StyleSheet.create({
  foto: {
    height: u(REJILLA.bannerAlto),
    borderRadius: u(REJILLA.curvatura),
    overflow: 'hidden',
    backgroundColor: '#3C3C3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subir: {
    fontFamily: Fonts.delgada,
    fontSize: 26,
    color: '#000000',
  },
  enlace: {
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.text,
    marginTop: Spacing.four,
    paddingHorizontal: u(REJILLA.margenLateral) * 2,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
  },
  ubicacion: {
    marginHorizontal: u(REJILLA.margenLateral) * 0.5,
    marginTop: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  presionado: {
    opacity: 0.7,
  },
  ubicacionLabel: {
    fontFamily: Fonts.medium,
    fontSize: 22,
    color: '#000000',
  },
  resumen: {
    fontFamily: Fonts.delgada,
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  duracion: {
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.text,
    textAlign: 'center',
    marginTop: Spacing.four,
  },
  paso: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: u(REJILLA.margenLateral) * 0.5,
    marginTop: Spacing.three,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  pasoSigno: {
    fontFamily: Fonts.medium,
    fontSize: 28,
    color: Colors.text,
  },
  pasoValor: {
    fontFamily: Fonts.medium,
    fontSize: 26,
    color: Colors.text,
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
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
  card: {
    flex: 1,
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
  },
  content: {
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
  },
  sectionLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: Colors.textMuted,
    marginBottom: Spacing.two,
  },
  misBannersSection: {
    marginTop: Spacing.six,
  },
  miBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  miBannerThumb: {
    width: 64,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#E4E4E4',
  },
  miBannerInfo: {
    flex: 1,
  },
  miBannerComuna: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: Colors.text,
  },
  estadoLabel: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    marginTop: 2,
  },
  estadoPendiente: {
    fontFamily: Fonts.light,
    color: Colors.warning,
  },
  estadoRechazado: {
    fontFamily: Fonts.light,
    color: Colors.danger,
  },
  accionBanner: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: Colors.accent,
  },
  estadoActivo: {
    fontFamily: Fonts.light,
    color: Colors.success,
  },
  estadoVencido: {
    fontFamily: Fonts.light,
    color: Colors.textMuted,
  },
  imagePicker: {
    marginBottom: Spacing.four,
  },
  imagePreview: {
    width: '100%',
    aspectRatio: FORMATO_RECORTE.banner[0] / FORMATO_RECORTE.banner[1],
    borderRadius: 14,
  },
  imagePlaceholder: {
    width: '100%',
    aspectRatio: FORMATO_RECORTE.banner[0] / FORMATO_RECORTE.banner[1],
    borderRadius: 14,
    // Sobre negro: el gris claro de antes era un parche blanco en la
    // pantalla.
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderLabel: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.textMuted,
  },
  campoLabel: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  selectorComuna: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  selectorPresionado: {
    backgroundColor: Colors.backgroundAlt,
  },
  selectorValor: {
    fontFamily: Fonts.light,
    flex: 1,
    fontSize: 16,
    color: Colors.text,
  },
  selectorPlaceholder: {
    color: Colors.placeholder,
  },
  selectorFlecha: {
    fontFamily: Fonts.light,
    fontSize: 16,
    color: Colors.textMuted,
  },
  aMedidaFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  aMedidaInput: {
    fontFamily: Fonts.light,
    width: 96,
    textAlign: 'center',
    fontSize: 18,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 12,
    paddingVertical: Spacing.two,
  },
  aMedidaHint: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.textMuted,
  },
  enlaceInput: {
    fontFamily: Fonts.light,
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
    fontSize: 15,
    color: Colors.text,
  },
  diasLabel: {
    fontFamily: Fonts.medium,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
    fontSize: 13,
    color: Colors.text,
  },
  diasRow: {
    flexDirection: 'row',
    // Envuelve: con la opción "Otra" son cinco fichas y en una pantalla
    // angosta la última quedaba fuera, sin forma de llegar a ella.
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  diaChip: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  diaChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  diaChipLabel: {
    fontFamily: Fonts.light,
    fontSize: 16,
    color: Colors.text,
  },
  diaChipLabelActive: {
    fontFamily: Fonts.medium,
    color: '#FFFFFF',
  },
  precioBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.four,
    padding: Spacing.three,
    backgroundColor: Colors.surface,
    borderRadius: 14,
  },
  precioLabel: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.textMuted,
  },
  precioValor: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: Colors.text,
  },
  errorText: {
    fontFamily: Fonts.light,
    marginTop: Spacing.three,
    fontSize: 13,
    color: Colors.danger,
  },
  successText: {
    fontFamily: Fonts.light,
    marginTop: Spacing.three,
    fontSize: 13,
    color: Colors.success,
  },
  disclaimer: {
    fontFamily: Fonts.light,
    marginTop: Spacing.three,
    fontSize: 11.5,
    lineHeight: 16,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
