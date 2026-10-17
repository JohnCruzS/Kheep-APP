import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SelectorZonas } from '@/components/admin/SelectorZonas';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { Comuna, crearBanners, fetchComunas } from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { PickedImage, pickAndCompressImage, uploadCompressedImage } from '@/lib/images';
import { REJILLA, u } from '@/lib/rejilla';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/SessionProvider';

const DIAS_MAX = 365;
const HORAS_MAX = 8760;

/**
 * Publicar un banner desde el panel del admin (maqueta del cliente, "Nuevo"):
 *
 *  - Arriba, "Subir": la foto queda ahí mismo como vista previa, con el alto
 *    con que se verá en el inicio.
 *  - Enlace: a dónde lleva tocarlo (opcional).
 *  - Ubicación: abre la lista de regiones y comunas para elegir dónde sale.
 *  - Días (− 3 +): tocar "Días" cambia a "Horas" y al revés.
 *  - General / Principal (se toca para cambiar): Principal sale primero en el
 *    carrusel una sola vez por teléfono, la primera vez que se abre la app;
 *    después queda en el orden normal (0042).
 *  - Publicar, al final.
 *
 * El banner del admin no pasa por revisión ni pago: sale al tiro.
 */
export default function BannerNuevoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, permisos } = useSession();
  const esGeneral = profile?.rol === 'admin';

  const [comunas, setComunas] = useState<Comuna[]>([]);
  const [imagen, setImagen] = useState<PickedImage | null>(null);
  const [enlace, setEnlace] = useState('');
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [eligiendo, setEligiendo] = useState(false);
  const [enHoras, setEnHoras] = useState(false);
  const [cantidad, setCantidad] = useState(3);
  const [principal, setPrincipal] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Solo lo que esta cuenta puede elegir: el de zona, sus comunas. Parte con
  // todo lo suyo encendido (el general, el país entero) y se apaga lo que no va.
  const disponibles = useMemo(
    () => (esGeneral ? comunas : comunas.filter((c) => permisos?.comunas.includes(c.id))),
    [comunas, esGeneral, permisos],
  );
  useEffect(() => {
    fetchComunas()
      .then(setComunas)
      .catch(() => setComunas([]));
  }, []);
  useEffect(() => {
    setElegidas(disponibles.map((c) => c.id));
  }, [disponibles]);

  // El general con todo encendido publica UN banner para todas las comunas
  // (también las que se activen después), no uno por cada una.
  const todoElPais = esGeneral && disponibles.length > 0 && elegidas.length === disponibles.length;
  const maximo = enHoras ? HORAS_MAX : DIAS_MAX;

  async function elegirFoto() {
    try {
      const foto = await pickAndCompressImage({ uso: 'banner' });
      if (foto) setImagen(foto);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo abrir la galería.'));
    }
  }

  function cambiarUnidad() {
    // Al pasar de días a horas se conserva la duración (3 días = 72 horas), y al revés.
    setCantidad((c) => (enHoras ? Math.max(1, Math.min(DIAS_MAX, Math.round(c / 24))) : Math.min(HORAS_MAX, c * 24)));
    setEnHoras((h) => !h);
  }

  async function publicar() {
    setError(null);
    if (!imagen) {
      setError('Sube la imagen del banner.');
      return;
    }
    if (elegidas.length === 0) {
      setError('Elige en Ubicación al menos una comuna.');
      return;
    }
    const enlaceLimpio = enlace.trim();
    if (enlaceLimpio && !/^https?:\/\/\S+$/i.test(enlaceLimpio) && !/^[\w-]+(\.[\w-]+)+\S*$/.test(enlaceLimpio)) {
      setError('El enlace no es válido (por ejemplo: www.kheep.cl).');
      return;
    }
    const url = enlaceLimpio && !/^https?:\/\//i.test(enlaceLimpio) ? `https://${enlaceLimpio}` : enlaceLimpio;

    setPublicando(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const imagenUrl = await uploadCompressedImage('banners', auth.user!.id, imagen, `banner-${Date.now()}`);
      await crearBanners({
        imagenUrl,
        comunaIds: todoElPais ? [null] : elegidas,
        // La base guarda también los días (de 1 a 365); con horas, los que cubren.
        dias: enHoras ? Math.max(1, Math.min(DIAS_MAX, Math.ceil(cantidad / 24))) : cantidad,
        horas: enHoras ? cantidad : null,
        enlace: url || null,
        pagado: true,
        prioritario: esGeneral,
        principal,
      });
      router.back();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo publicar el banner.'));
    } finally {
      setPublicando(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <EncabezadoMarca subtitulo="Nuevo" />

      <ScrollView
        contentContainerStyle={[styles.contenido, { paddingBottom: Spacing.three + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* La foto como vista previa, al alto con que se verá en el inicio. */}
        <Pressable onPress={elegirFoto} style={styles.foto} accessibilityRole="button" accessibilityLabel="Subir imagen">
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
          onPress={() => setEligiendo(true)}
          accessibilityRole="button">
          <Text style={styles.ubicacionLabel}>Ubicación</Text>
        </Pressable>
        <Text style={styles.resumen} numberOfLines={1}>
          {todoElPais ? 'Todas las comunas' : `${elegidas.length} ${elegidas.length === 1 ? 'comuna' : 'comunas'}`}
        </Text>

        {/* Tocar la palabra cambia entre días y horas. */}
        <Pressable onPress={cambiarUnidad} hitSlop={8} accessibilityRole="button">
          <Text style={styles.unidad}>{enHoras ? 'Horas' : 'Días'}</Text>
        </Pressable>
        <View style={styles.paso}>
          <Pressable onPress={() => setCantidad((c) => Math.max(1, c - 1))} hitSlop={12} accessibilityLabel="Menos">
            <Text style={styles.pasoSigno}>-</Text>
          </Pressable>
          <Text style={styles.pasoValor}>{cantidad}</Text>
          <Pressable onPress={() => setCantidad((c) => Math.min(maximo, c + 1))} hitSlop={12} accessibilityLabel="Más">
            <Text style={styles.pasoSigno}>+</Text>
          </Pressable>
        </View>

        {/* Tipo de banner: se toca para cambiar. */}
        <Pressable onPress={() => setPrincipal((p) => !p)} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.tipo, principal && styles.tipoPrincipal]}>{principal ? 'Principal' : 'General'}</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.publicar, pressed && styles.publicarPresionado]}
          onPress={publicar}
          disabled={publicando}
          accessibilityRole="button">
          {publicando ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.publicarLabel}>Publicar</Text>}
        </Pressable>
      </ScrollView>

      <SelectorZonas
        visible={eligiendo}
        comunas={disponibles}
        elegidas={elegidas}
        onClose={() => setEligiendo(false)}
        onListo={(ids) => {
          setElegidas(ids);
          setEligiendo(false);
        }}
      />
    </SafeAreaView>
  );
}

const margen = u(REJILLA.margenLateral);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contenido: {
    paddingHorizontal: margen,
    paddingTop: Spacing.three,
  },
  foto: {
    height: u(REJILLA.bannerAlto),
    borderRadius: u(REJILLA.curvatura),
    overflow: 'hidden',
    backgroundColor: '#3C3C3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subir: {
    fontFamily: Fonts.medium,
    fontSize: 24,
    color: '#000000',
  },
  enlace: {
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.text,
    marginTop: Spacing.four,
    paddingHorizontal: margen * 2,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
  },
  ubicacion: {
    marginHorizontal: margen * 0.5,
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
  unidad: {
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
    marginHorizontal: margen * 0.5,
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
  tipo: {
    fontFamily: Fonts.delgada,
    fontSize: 24,
    color: Colors.text,
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  tipoPrincipal: {
    color: Colors.accent,
  },
  error: {
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.danger,
    textAlign: 'center',
    marginTop: Spacing.three,
  },
  publicar: {
    marginTop: Spacing.five,
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
});
