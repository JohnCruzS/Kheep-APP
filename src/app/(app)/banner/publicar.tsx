import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PickerField } from '@/components/forms/PickerField';
import { Button } from '@/components/ui/Button';
import { Colors, Radius, Spacing } from '@/constants/theme';
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

export default function PublicarBannerScreen() {
  const router = useRouter();
  const { session, profile } = useSession();
  const esAdmin = profile?.rol === 'admin';

  const [misBanners, setMisBanners] = useState<MiBanner[]>([]);
  const [comunas, setComunas] = useState<Comuna[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [imagen, setImagen] = useState<PickedImage | null>(null);
  const [comunaId, setComunaId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dias, setDias] = useState(7);

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

    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const imagenUrl = await uploadCompressedImage('banners', auth.user!.id, imagen, `banner-${Date.now()}`);
      const bannerId = await crearBanner({ imagenUrl, comunaId, dias });

      if (!esAdmin) {
        await pagarBanner(bannerId);
        setSuccess(`¡Listo! Pagaste $${(dias * PRECIO_BANNER_POR_DIA).toLocaleString('es-CL')} y tu banner ya está activo.`);
      } else {
        setSuccess('¡Listo! Tu banner ya está activo.');
      }

      setImagen(null);
      setComunaId(null);
      setDias(7);
      cargar();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo publicar el banner.'));
    } finally {
      setSaving(false);
    }
  }

  const comunaNombre = comunas.find((c) => c.id === comunaId)?.nombre ?? '';
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
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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

          <PickerField
            label="Comuna donde se muestra (opcional)"
            value={comunaNombre}
            open={pickerOpen}
            onToggle={() => setPickerOpen((p) => !p)}
            options={comunas.map((c) => ({ id: c.id, label: c.nombre }))}
            onSelect={(id) => {
              setComunaId(id);
              setPickerOpen(false);
            }}
          />

          <Text style={styles.diasLabel}>¿Cuántos días quieres que dure?</Text>
          <View style={styles.diasRow}>
            {OPCIONES_DIAS.map((opcion) => (
              <Pressable
                key={opcion}
                onPress={() => setDias(opcion)}
                style={[styles.diaChip, dias === opcion && styles.diaChipActive]}>
                <Text style={[styles.diaChipLabel, dias === opcion && styles.diaChipLabelActive]}>{opcion} días</Text>
              </Pressable>
            ))}
          </View>

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
        </ScrollView>
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
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
    width: 70,
  },
  topTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
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
    fontSize: 11,
    fontWeight: '700',
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
    fontSize: 14,
    fontWeight: '700',
    color: Colors.cardText,
  },
  estadoLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  estadoPendiente: {
    color: Colors.warning,
  },
  estadoActivo: {
    color: Colors.success,
  },
  estadoVencido: {
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
    fontSize: 13,
    color: Colors.cardTextMuted,
  },
  diasLabel: {
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.cardText,
  },
  diasRow: {
    flexDirection: 'row',
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
    fontSize: 12.5,
    fontWeight: '600',
    color: Colors.cardText,
  },
  diaChipLabelActive: {
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
    fontSize: 13,
    color: Colors.cardTextMuted,
  },
  precioValor: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.cardText,
  },
  errorText: {
    marginTop: Spacing.three,
    fontSize: 13,
    color: Colors.danger,
  },
  successText: {
    marginTop: Spacing.three,
    fontSize: 13,
    color: Colors.success,
  },
  disclaimer: {
    marginTop: Spacing.three,
    fontSize: 11.5,
    lineHeight: 16,
    color: Colors.cardTextMuted,
    textAlign: 'center',
  },
});
