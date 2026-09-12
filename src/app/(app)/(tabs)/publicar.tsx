import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ComunaFieldPicker } from '@/components/forms/ComunaFieldPicker';
import { PickerField } from '@/components/forms/PickerField';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import {
  Categoria,
  Comuna,
  MiPublicacion,
  crearPublicacion,
  fetchCategorias,
  fetchComunas,
  fetchMisPublicaciones,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { PickedImage, pickAndCompressImage, uploadCompressedImage } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/SessionProvider';

type ProductoDraft = {
  nombre: string;
  precio: string;
  image: PickedImage | null;
};

const EMPTY_DRAFT: ProductoDraft = { nombre: '', precio: '', image: null };

export default function PublicarScreen() {
  const { session, profile } = useSession();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <BrandLogo height={29} />
        <Text style={styles.eyebrow}>Publicar</Text>
      </View>

      <View style={styles.card}>
        {session ? <PublicarForm telefonoContacto={profile?.telefono_contacto ?? null} /> : <GuestGate />}
      </View>
    </SafeAreaView>
  );
}

function GuestGate() {
  const router = useRouter();
  return (
    <View style={styles.guest}>
      <View style={styles.avatarPlaceholder} />
      <Text style={styles.guestTitle}>Inicia sesión para publicar</Text>
      <Text style={styles.guestMessage}>Publicar tu negocio en Kheep es gratis, pero necesitas una cuenta.</Text>
      <Button label="Ingresar" onPress={() => router.push('/(auth)/login')} />
      <Button label="Registrar" variant="secondary" onPress={() => router.push('/(auth)/register')} />
    </View>
  );
}

function PublicarForm({ telefonoContacto }: { telefonoContacto: string | null }) {
  const router = useRouter();

  const [misPublicaciones, setMisPublicaciones] = useState<MiPublicacion[]>([]);
  const [misPublicacionesLoading, setMisPublicacionesLoading] = useState(true);

  // useFocusEffect en vez de useEffect: si edito una publicación y vuelvo
  // acá con "Volver", la lista tiene que reflejar el cambio altiro, no
  // quedarse con los datos de antes de entrar a editar.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchMisPublicaciones()
        .then((data) => active && setMisPublicaciones(data))
        .catch(() => {})
        .finally(() => active && setMisPublicacionesLoading(false));
      return () => {
        active = false;
      };
    }, []),
  );

  const [nombre, setNombre] = useState('');
  const [logo, setLogo] = useState<PickedImage | null>(null);

  const [comunas, setComunas] = useState<Comuna[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [comunaId, setComunaId] = useState<string | null>(null);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState<'categoria' | null>(null);

  const [draft, setDraft] = useState<ProductoDraft>(EMPTY_DRAFT);
  const [productos, setProductos] = useState<ProductoDraft[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchComunas().then(setComunas).catch(() => {});
    fetchCategorias().then(setCategorias).catch(() => {});
  }, []);

  const categoriaNombre = categorias.find((c) => c.id === categoriaId)?.nombre ?? '';

  async function handlePickLogo() {
    try {
      const image = await pickAndCompressImage();
      if (image) setLogo(image);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo abrir la galería.'));
    }
  }

  async function handlePickProductoImage() {
    try {
      const image = await pickAndCompressImage();
      if (image) setDraft((d) => ({ ...d, image }));
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo abrir la galería.'));
    }
  }

  function handleAgregarProducto() {
    setError(null);
    const precioNumero = Number(draft.precio.replace(/[^\d]/g, ''));
    if (draft.nombre.trim().length === 0) {
      setError('Ponle un nombre al producto antes de agregarlo.');
      return;
    }
    if (!precioNumero || precioNumero <= 0) {
      setError('Ingresa un precio válido para el producto.');
      return;
    }
    if (productos.length >= 5) {
      setError('Máximo 5 productos por publicación.');
      return;
    }
    setProductos((list) => [...list, { ...draft, precio: String(precioNumero) }]);
    setDraft(EMPTY_DRAFT);
  }

  function handleQuitarProducto(index: number) {
    setProductos((list) => list.filter((_, i) => i !== index));
  }

  async function handleGuardar() {
    setError(null);
    setSuccess(null);

    if (nombre.trim().length === 0) {
      setError('Ponle un nombre a tu negocio.');
      return;
    }
    if (!telefonoContacto) {
      setError('Agrega un teléfono de contacto en tu perfil antes de publicar.');
      return;
    }

    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user!.id;

      const logoUrl = logo ? await uploadCompressedImage('logos', userId, logo, 'logo') : null;

      const productosConUrl = await Promise.all(
        productos.map(async (producto, index) => ({
          nombre: producto.nombre,
          precio: Number(producto.precio),
          imagen_url: producto.image ? await uploadCompressedImage('productos', userId, producto.image, `producto-${index}`) : null,
        })),
      );

      await crearPublicacion({
        titulo: nombre.trim(),
        categoriaId,
        comunaId,
        logoUrl,
        productos: productosConUrl,
      });

      setSuccess('¡Listo! Tu publicación fue creada. Si tu cuenta está en revisión, un admin la va a aprobar pronto.');
      setNombre('');
      setLogo(null);
      setComunaId(null);
      setCategoriaId(null);
      setProductos([]);
      setDraft(EMPTY_DRAFT);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo guardar la publicación.'));
    } finally {
      setSaving(false);
    }
  }

  // Con la pantalla de borde a borde, Android ya no achica la ventana al abrir
  // el teclado (el `adjustResize` del manifiesto deja de aplicar), así que el
  // teclado tapaba los campos. `KeyboardAvoidingView` agrega abajo el alto del
  // teclado para que el formulario se corra solo.
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
      {!misPublicacionesLoading && misPublicaciones.length > 0 && (
        <View style={styles.misPublicacionesSection}>
          <Text style={styles.sectionLabel}>MIS PUBLICACIONES</Text>
          {misPublicaciones.map((publicacion) => (
            <Pressable
              key={publicacion.id}
              style={styles.miPublicacionRow}
              onPress={() => router.push({ pathname: '/(app)/publicacion/editar/[id]', params: { id: publicacion.id } })}>
              {publicacion.logo_url ? (
                <Image source={{ uri: publicacion.logo_url }} style={styles.miPublicacionThumb} contentFit="cover" />
              ) : (
                <View style={[styles.miPublicacionThumb, styles.productoThumbEmpty]} />
              )}
              <View style={styles.productoInfo}>
                <Text style={styles.productoNombre} numberOfLines={1}>
                  {publicacion.titulo}
                </Text>
                <Text style={styles.productoPrecio}>
                  {[publicacion.categoria?.nombre, publicacion.comuna?.nombre].filter(Boolean).join(' · ') ||
                    'Sin categoría/comuna'}
                </Text>
              </View>
              <EstadoBadge estado={publicacion.estado} />
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.sectionLabel}>NUEVA PUBLICACIÓN</Text>

      <Pressable onPress={handlePickLogo} style={styles.avatarWrapper}>
        {logo ? (
          <Image source={{ uri: logo.uri }} style={styles.avatarImage} contentFit="cover" />
        ) : (
          <View style={styles.avatarPlaceholder} />
        )}
      </Pressable>

      <TextField label="Nombre" value={nombre} onChangeText={setNombre} autoCapitalize="words" />

      <ComunaFieldPicker label="Comuna" comunas={comunas} selectedId={comunaId} onSelect={setComunaId} />

      <PickerField
        label="Categoría"
        value={categoriaNombre}
        open={pickerOpen === 'categoria'}
        onToggle={() => setPickerOpen((p) => (p === 'categoria' ? null : 'categoria'))}
        options={categorias.map((c) => ({ id: c.id, label: c.icono ? `${c.icono} ${c.nombre}` : c.nombre }))}
        onSelect={(id) => {
          setCategoriaId(id);
          setPickerOpen(null);
        }}
      />

      {telefonoContacto ? (
        <Text style={styles.telefonoNota}>
          Los interesados te van a escribir al <Text style={styles.telefonoNotaFuerte}>{telefonoContacto}</Text> de
          tu perfil.
        </Text>
      ) : (
        <Pressable onPress={() => router.push('/(app)/perfil/editar')}>
          <Text style={styles.telefonoNotaAlerta}>
            Todavía no tienes un teléfono de contacto en tu perfil. Agrégalo para poder publicar →
          </Text>
        </Pressable>
      )}

      <Text style={styles.sectionLabel}>PRODUCTOS ({productos.length}/5)</Text>

      {productos.map((producto, index) => (
        <View key={`${producto.nombre}-${index}`} style={styles.productoRow}>
          {producto.image ? (
            <Image source={{ uri: producto.image.uri }} style={styles.productoThumb} contentFit="cover" />
          ) : (
            <View style={[styles.productoThumb, styles.productoThumbEmpty]} />
          )}
          <View style={styles.productoInfo}>
            <Text style={styles.productoNombre}>{producto.nombre}</Text>
            <Text style={styles.productoPrecio}>${Number(producto.precio).toLocaleString('es-CL')}</Text>
          </View>
          <Pressable onPress={() => handleQuitarProducto(index)} hitSlop={8}>
            <Text style={styles.productoQuitar}>Quitar</Text>
          </Pressable>
        </View>
      ))}

      {productos.length < 5 && (
        <View style={styles.productoRow}>
          <Pressable onPress={handlePickProductoImage}>
            {draft.image ? (
              <Image source={{ uri: draft.image.uri }} style={styles.productoThumb} contentFit="cover" />
            ) : (
              <View style={[styles.productoThumb, styles.productoThumbEmpty]} />
            )}
          </Pressable>
          <View style={styles.productoInfo}>
            <TextInput
              placeholder="Producto"
              placeholderTextColor={Colors.placeholder}
              value={draft.nombre}
              onChangeText={(text) => setDraft((d) => ({ ...d, nombre: text }))}
              style={styles.productoInput}
            />
            <TextInput
              placeholder="Precio"
              placeholderTextColor={Colors.placeholder}
              value={draft.precio}
              onChangeText={(text) => setDraft((d) => ({ ...d, precio: text }))}
              keyboardType="number-pad"
              style={[styles.productoInput, styles.productoInputMuted]}
            />
          </View>
        </View>
      )}

      <Button label="Agregar" onPress={handleAgregarProducto} />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {success ? <Text style={styles.successText}>{success}</Text> : null}

      {saving ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.three }} />
      ) : (
        <Button label="Guardar" variant="secondary" onPress={handleGuardar} />
      )}
    </ScrollView>
      </KeyboardAvoidingView>
  );
}

function EstadoBadge({ estado }: { estado: MiPublicacion['estado'] }) {
  const config = {
    pendiente: { label: 'En revisión', style: styles.badgeRevision, labelStyle: styles.badgeLabelRevision },
    aprobado: { label: 'Publicada', style: styles.badgeVerificado, labelStyle: styles.badgeLabelVerificado },
    rechazado: { label: 'Rechazada', style: styles.badgeRechazado, labelStyle: styles.badgeLabelRechazado },
  }[estado];

  return (
    <View style={[styles.badge, config.style]}>
      <Text style={[styles.badgeLabel, config.labelStyle]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
  },
  eyebrow: {
    fontFamily: Fonts.light,
    marginTop: 2,
    fontSize: 13,
    color: Colors.textMuted,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
  },
  formContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.six,
  },
  guest: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
  },
  guestTitle: {
    fontFamily: Fonts.semiBold,
    marginTop: Spacing.three,
    fontSize: 18,
    color: Colors.cardText,
  },
  guestMessage: {
    fontFamily: Fonts.light,
    marginTop: Spacing.two,
    marginBottom: Spacing.two,
    fontSize: 13.5,
    lineHeight: 20,
    color: Colors.cardTextMuted,
    textAlign: 'center',
  },
  avatarWrapper: {
    alignSelf: 'center',
    marginBottom: Spacing.two,
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: Radius.avatar,
    backgroundColor: '#D9D9D9',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: Radius.avatar,
  },
  misPublicacionesSection: {
    marginBottom: Spacing.two,
  },
  miPublicacionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 4,
    marginBottom: Spacing.three,
  },
  miPublicacionThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 10.5,
  },
  badgeRevision: {
    backgroundColor: Colors.warningBg,
  },
  badgeVerificado: {
    backgroundColor: Colors.successBg,
  },
  badgeRechazado: {
    backgroundColor: '#FFE0E0',
  },
  badgeLabelRevision: {
    color: Colors.warning,
  },
  badgeLabelVerificado: {
    color: Colors.success,
  },
  badgeLabelRechazado: {
    color: Colors.danger,
  },
  sectionLabel: {
    fontFamily: Fonts.semiBold,
    marginTop: Spacing.five,
    marginBottom: Spacing.two,
    fontSize: 11,
    letterSpacing: 0.6,
    color: Colors.cardTextMuted,
  },
  telefonoNota: {
    fontFamily: Fonts.light,
    marginTop: Spacing.four,
    fontSize: 13,
    color: Colors.cardTextMuted,
  },
  telefonoNotaFuerte: {
    fontFamily: Fonts.semiBold,

    color: Colors.cardText,
  },
  telefonoNotaAlerta: {
    fontFamily: Fonts.medium,
    marginTop: Spacing.four,
    fontSize: 13,
    color: Colors.danger,
  },
  productoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 4,
    marginBottom: Spacing.three,
  },
  productoThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
  },
  productoThumbEmpty: {
    backgroundColor: '#E4E4E4',
  },
  productoInfo: {
    flex: 1,
  },
  productoNombre: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    color: Colors.cardText,
  },
  productoPrecio: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.cardTextMuted,
    marginTop: 2,
  },
  productoInput: {
    fontFamily: Fonts.light,
    fontSize: 15,
    color: Colors.cardText,
    paddingVertical: 2,
  },
  productoInputMuted: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.cardTextMuted,
  },
  productoQuitar: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: Colors.danger,
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
});
