import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SelectorComuna } from '@/components/admin/SelectorComuna';
import { Button } from '@/components/ui/Button';
import { FormScroll } from '@/components/ui/FormScroll';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import {
  Comuna,
  MiBanner,
  PRECIO_BANNER_POR_DIA,
  crearBanner,
  fetchComunas,
  fetchMisBanners,
  pagarBanner,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { PickedImage, pickAndCompressImage, uploadCompressedImage } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/SessionProvider';

const OPCIONES_DIAS = [3, 7, 15, 30];
/** Tope de la duración a medida: un año. Más que eso es un error de tecleo. */
const DIAS_MAX = 365;

export default function PublicarBannerScreen() {
  const router = useRouter();
  const { session, profile } = useSession();
  const esAdmin = profile?.rol === 'admin';

  const [misBanners, setMisBanners] = useState<MiBanner[]>([]);
  const [comunas, setComunas] = useState<Comuna[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [imagen, setImagen] = useState<PickedImage | null>(null);
  // Tres estados distintos, y hacen falta los tres: `undefined` es que
  // todavía no ha elegido, `null` es "todas las comunas" y un id es una
  // comuna concreta. Con solo `null` no se podía saber si había elegido todas
  // o si no había tocado el campo, y al elegir "todas" el botón seguía
  // mostrando el texto de ayuda como si no se hubiera hecho nada.
  const [comunaId, setComunaId] = useState<string | null | undefined>(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dias, setDias] = useState(7);
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
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudieron cargar tus banners.'));
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (session) cargar();
  }, [session, cargar]);

  async function handlePickImagen() {
    try {
      const image = await pickAndCompressImage([2, 1]);
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

    // Un comerciante paga por aparecer en SU comuna: sin elegirla, el banner
    // saldría en todo el país. El admin sí puede dejarlo en "todas".
    if (!esAdmin && !comunaId) {
      // Para un comerciante, ni "sin elegir" ni "todas" son válidos: paga por
      // aparecer en su comuna.
      setError('Elige la comuna donde quieres que se muestre.');
      return;
    }

    if (dias < 1 || dias > DIAS_MAX) {
      setError(`La duración tiene que estar entre 1 y ${DIAS_MAX} días.`);
      return;
    }

    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const imagenUrl = await uploadCompressedImage('banners', auth.user!.id, imagen, `banner-${Date.now()}`);
      const bannerId = await crearBanner({ imagenUrl, comunaId: comunaId ?? null, dias, pagado: esAdmin });

      if (!esAdmin) {
        await pagarBanner(bannerId);
        setSuccess(`¡Listo! Pagaste $${(dias * PRECIO_BANNER_POR_DIA).toLocaleString('es-CL')} y tu banner ya está activo.`);
      } else {
        setSuccess('¡Listo! Tu banner ya está activo.');
      }

      setImagen(null);
      setComunaId(undefined);
      setDias(7);
      cargar();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo publicar el banner.'));
    } finally {
      setSaving(false);
    }
  }

  const comunaElegida =
    comunaId === undefined
      ? ''
      : comunaId === null
        ? 'Todas las comunas'
        : (comunas.find((c) => c.id === comunaId)?.nombre ?? '');
  const precio = dias * PRECIO_BANNER_POR_DIA;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backLabel}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.topTitle}>Publicar banner</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={styles.card}>
        {/* `FormScroll` se encarga del teclado igual que en el resto de la app:
          reserva su alto y corre el formulario si el campo enfocado quedaría
          tapado. */}
      <FormScroll contentContainerStyle={styles.content}>
          {!loadingList && misBanners.length > 0 && (
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
              {comunaElegida || (esAdmin ? 'Elige una comuna o todas' : 'Elige tu comuna')}
            </Text>
            <Text style={styles.selectorFlecha}>▾</Text>
          </Pressable>

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

          {!esAdmin && (
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
              label={esAdmin ? 'Publicar' : `Pagar $${precio.toLocaleString('es-CL')} (simulado)`}
              onPress={handlePublicar}
            />
          )}

          {!esAdmin && (
            <Text style={styles.disclaimer}>
              El cobro real todavía no está conectado — este botón simula el pago para que puedas probar la función.
            </Text>
          )}
      </FormScroll>

      {/* Solo el admin puede poner un banner en todo el país: un comerciante
          paga por aparecer en su comuna. */}
      <SelectorComuna
        visible={pickerOpen}
        titulo="¿Dónde se muestra el banner?"
        comunas={comunas}
        conTodas={esAdmin}
        onClose={() => setPickerOpen(false)}
        onElegir={(id) => {
          setComunaId(id);
          setPickerOpen(false);
        }}
      />
      </View>
    </SafeAreaView>
  );
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
    backgroundColor: Colors.card,
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
    color: Colors.cardTextMuted,
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
    color: Colors.cardText,
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
    color: Colors.cardTextMuted,
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
    backgroundColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderLabel: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.cardTextMuted,
  },
  campoLabel: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.cardTextMuted,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  selectorComuna: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  selectorPresionado: {
    backgroundColor: '#F2F2F2',
  },
  selectorValor: {
    fontFamily: Fonts.light,
    flex: 1,
    fontSize: 16,
    color: Colors.cardText,
  },
  selectorPlaceholder: {
    color: Colors.placeholder,
  },
  selectorFlecha: {
    fontFamily: Fonts.light,
    fontSize: 16,
    color: Colors.cardTextMuted,
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
    color: Colors.cardText,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 12,
    paddingVertical: Spacing.two,
  },
  aMedidaHint: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.cardTextMuted,
  },
  diasLabel: {
    fontFamily: Fonts.medium,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
    fontSize: 13,
    color: Colors.cardText,
  },
  diasRow: {
    flexDirection: 'row',
    // Envuelve: con la opción "Otra" son cinco fichas y en una pantalla
    // angosta la última quedaba fuera, sin forma de llegar a ella.
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  diaChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 20,
    backgroundColor: '#F1F1F1',
  },
  diaChipActive: {
    backgroundColor: Colors.accent,
  },
  diaChipLabel: {
    fontFamily: Fonts.medium,
    fontSize: 12.5,
    color: Colors.cardText,
  },
  diaChipLabelActive: {
    fontFamily: Fonts.light,
    color: '#FFFFFF',
  },
  precioBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.four,
    padding: Spacing.three,
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
  },
  precioLabel: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.cardTextMuted,
  },
  precioValor: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: Colors.cardText,
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
    color: Colors.cardTextMuted,
    textAlign: 'center',
  },
});
