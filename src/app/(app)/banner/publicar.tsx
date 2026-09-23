import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { SelectorZonas } from '@/components/admin/SelectorZonas';
import { Button } from '@/components/ui/Button';
import { FormScroll } from '@/components/ui/FormScroll';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import {
  Comuna,
  MiBanner,
  PRECIO_BANNER_POR_DIA,
  CUPO_BANNERS,
  contarBannersVigentes,
  crearBanners,
  fetchComunas,
  fetchMisBanners,
  pagarBanner,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { PickedImage, pickAndCompressImage, uploadCompressedImage } from '@/lib/images';
import { compararRegiones, nombreRegion } from '@/lib/regiones';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/SessionProvider';

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
  const [comunas, setComunas] = useState<Comuna[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [imagen, setImagen] = useState<PickedImage | null>(null);
  // Las comunas donde se muestra: se eligen por región o sueltas, con
  // interruptores (documento EDIT APP).
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dias, setDias] = useState(7);
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
      const [banners, comunasData] = await Promise.all([fetchMisBanners(), fetchComunas()]);
      setMisBanners(banners);
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
      const image = await pickAndCompressImage({ aspect: [2, 1], uso: 'banner' });
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
    const enlaceLimpio = enlace.trim();
    if (enlaceLimpio && !/^https?:\/\/\S+$/i.test(enlaceLimpio)) {
      setError('El enlace tiene que empezar con http:// o https://');
      return;
    }

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

      if (!esAdmin && !esZona) {
        for (const id of ids) await pagarBanner(id);
        setSuccess(`¡Listo! Pagaste $${precio.toLocaleString('es-CL')} y tu banner ya está activo.`);
      } else {
        setSuccess('¡Listo! Tu banner ya está activo.');
      }

      setImagen(null);
      if (!esAdmin && !esZona) setElegidas([]);
      setDias(7);
      setEnlace('');
      cargar();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo publicar el banner.'));
    } finally {
      setSaving(false);
    }
  }

  const comunaElegida = resumirZona(elegidas, disponibles, todoElPais);
  // Un comerciante paga por cada comuna donde aparece.
  const precio = dias * PRECIO_BANNER_POR_DIA * Math.max(1, elegidas.length);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <EncabezadoMarca subtitulo="Publicar banner" onVolver={() => router.back()} />

      <View style={styles.card}>
        {/* `FormScroll` se encarga del teclado igual que en el resto de la app:
          reserva su alto y corre el formulario si el campo enfocado quedaría
          tapado. */}
      <FormScroll contentContainerStyle={styles.content}>
          {/* "Mis banners" es para el comerciante, que no tiene otra forma de
              ver los suyos. El admin los administra todos en Panel → Banners,
              así que acá solo estorbaba. */}
          {!esAdmin && !esZona && !loadingList && misBanners.length > 0 && (
            <View style={styles.misBannersSection}>
              <Text style={styles.sectionLabel}>MIS BANNERS</Text>
              {misBanners.map((banner) => (
                <View key={banner.id} style={styles.miBannerRow}>
                  <Image source={{ uri: banner.imagen_url }} style={styles.miBannerThumb} contentFit="cover" />
                  <View style={styles.miBannerInfo}>
                    <Text style={styles.miBannerComuna}>{banner.comuna?.nombre ?? 'Todas las comunas'}</Text>
                    <EstadoBanner banner={banner} />
                  </View>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.sectionLabel}>NUEVO BANNER</Text>

          <Pressable onPress={handlePickImagen} style={styles.imagePicker}>
            {imagen ? (
              <Image source={{ uri: imagen.uri }} style={styles.imagePreview} contentFit="cover" />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Text style={styles.imagePlaceholderLabel}>Toca para subir una imagen (2:1)</Text>
              </View>
            )}
          </Pressable>

          {/* Un botón que abre el buscador, en vez de la fila de fichas: con
              las ~346 comunas del país había que deslizar a ciegas hasta
              encontrar la propia. */}
          <Text style={styles.campoLabel}>¿Dónde se muestra?</Text>
          <Pressable
            style={({ pressed }) => [styles.selectorComuna, pressed && styles.selectorPresionado]}
            onPress={() => setPickerOpen(true)}>
            <Text style={[styles.selectorValor, !comunaElegida && styles.selectorPlaceholder]}>
              {comunaElegida || 'Elige región o comuna'}
            </Text>
            <Text style={styles.selectorFlecha}>▾</Text>
          </Pressable>

          <Text style={styles.diasLabel}>¿A dónde lleva al tocarlo?</Text>
          <TextInput
            value={enlace}
            onChangeText={setEnlace}
            placeholder="https://… (opcional)"
            placeholderTextColor={Colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.enlaceInput}
          />

          <Text style={styles.diasLabel}>¿Cuántos días quieres que dure?</Text>
          <View style={styles.diasRow}>
            {OPCIONES_DIAS.map((opcion) => {
              const elegida = !aMedida && dias === opcion;
              return (
                <Pressable
                  key={opcion}
                  onPress={() => {
                    setAMedida(false);
                    setDias(opcion);
                  }}
                  style={[styles.diaChip, elegida && styles.diaChipActive]}>
                  <Text style={[styles.diaChipLabel, elegida && styles.diaChipLabelActive]}>{opcion} días</Text>
                </Pressable>
              );
            })}

            <Pressable
              onPress={() => {
                setAMedida(true);
                // Vacío, no con el valor anterior: quien elige "Otra" va a
                // escribir su número, y arrastrar el viejo hacía que quedara
                // pegado delante (7 + 45 = "745").
                setDiasLibres('');
              }}
              style={[styles.diaChip, aMedida && styles.diaChipActive]}>
              <Text style={[styles.diaChipLabel, aMedida && styles.diaChipLabelActive]}>Otra</Text>
            </Pressable>
          </View>

          {aMedida && (
            <View style={styles.aMedidaFila}>
              <TextInput
                value={diasLibres}
                onChangeText={(texto) => {
                  const soloNumeros = texto.replace(/[^0-9]/g, '').slice(0, 3);
                  const numero = Number(soloNumeros);
                  // Pasarse del tope recorta el número en el propio campo, en
                  // vez de aceptarlo a medias: así lo que se ve escrito es
                  // siempre lo que se va a cobrar.
                  const limitado = numero > DIAS_MAX ? String(DIAS_MAX) : soloNumeros;
                  setDiasLibres(limitado);
                  if (Number(limitado) >= 1) setDias(Number(limitado));
                }}
                keyboardType="number-pad"
                placeholder="Días"
                placeholderTextColor={Colors.placeholder}
                style={styles.aMedidaInput}
                autoFocus
              />
              <Text style={styles.aMedidaHint}>días (1 a {DIAS_MAX})</Text>
            </View>
          )}

          {!esAdmin && !esZona && (
            <View style={styles.precioBox}>
              <Text style={styles.precioLabel}>Total a pagar</Text>
              <Text style={styles.precioValor}>${precio.toLocaleString('es-CL')}</Text>
            </View>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {success ? <Text style={styles.successText}>{success}</Text> : null}

          {saving ? (
            <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.three }} />
          ) : (
            <Button
              label={esAdmin || esZona ? 'Publicar' : `Pagar $${precio.toLocaleString('es-CL')} (simulado)`}
              onPress={handlePublicar}
            />
          )}

          {!esAdmin && (
            <Text style={styles.disclaimer}>
              El cobro real todavía no está conectado — este botón simula el pago para que puedas probar la función.
            </Text>
          )}
      </FormScroll>

      <SelectorZonas
        visible={pickerOpen}
        comunas={disponibles}
        elegidas={elegidas}
        onClose={() => setPickerOpen(false)}
        onListo={(ids) => {
          setElegidas(ids);
          setPickerOpen(false);
        }}
      />
      </View>
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
  // "pagado" solo aplica a un comerciante — un banner de admin queda activo
  // sin pasar por ahí, así que lo que de verdad importa para mostrar el
  // estado es `activo`, no `pagado` (ver fn_banner_defaults en la 0012).
  if (!banner.activo && !banner.pagado) {
    return <Text style={[styles.estadoLabel, styles.estadoPendiente]}>Pendiente de pago</Text>;
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
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
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
    marginBottom: Spacing.five,
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
    aspectRatio: 2,
    borderRadius: 14,
  },
  imagePlaceholder: {
    width: '100%',
    aspectRatio: 2,
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
