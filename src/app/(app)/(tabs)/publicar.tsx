import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { Categoria, Comuna, crearPublicacion, fetchCategorias, fetchComunas } from '@/lib/catalog';
import { PickedImage, pickAndCompressImage, uploadCompressedImage } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import { isValidChileanPhone, normalizeChileanPhone } from '@/lib/validation';
import { useSession } from '@/providers/SessionProvider';

type ProductoDraft = {
  nombre: string;
  precio: string;
  image: PickedImage | null;
};

const EMPTY_DRAFT: ProductoDraft = { nombre: '', precio: '', image: null };

export default function PublicarScreen() {
  const { session } = useSession();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.logo}>
          <Text style={styles.logoAccent}>Kh</Text>eep
        </Text>
        <Text style={styles.eyebrow}>Publicar</Text>
      </View>

      <View style={styles.card}>{session ? <PublicarForm /> : <GuestGate />}</View>
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

function PublicarForm() {
  const router = useRouter();

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [logo, setLogo] = useState<PickedImage | null>(null);

  const [comunas, setComunas] = useState<Comuna[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [comunaId, setComunaId] = useState<string | null>(null);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState<'comuna' | 'categoria' | null>(null);

  const [draft, setDraft] = useState<ProductoDraft>(EMPTY_DRAFT);
  const [productos, setProductos] = useState<ProductoDraft[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchComunas().then(setComunas).catch(() => {});
    fetchCategorias().then(setCategorias).catch(() => {});
  }, []);

  const comunaNombre = comunas.find((c) => c.id === comunaId)?.nombre ?? '';
  const categoriaNombre = categorias.find((c) => c.id === categoriaId)?.nombre ?? '';

  async function handlePickLogo() {
    try {
      const image = await pickAndCompressImage();
      if (image) setLogo(image);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir la galería.');
    }
  }

  async function handlePickProductoImage() {
    try {
      const image = await pickAndCompressImage();
      if (image) setDraft((d) => ({ ...d, image }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir la galería.');
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
    if (!isValidChileanPhone(telefono)) {
      setError('Ingresa un teléfono chileno válido (ej: 9 1234 5678).');
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
        telefono: normalizeChileanPhone(telefono),
        categoriaId,
        comunaId,
        logoUrl,
        productos: productosConUrl,
      });

      setSuccess('¡Listo! Tu publicación fue creada. Si tu cuenta está en revisión, un admin la va a aprobar pronto.');
      setNombre('');
      setTelefono('');
      setLogo(null);
      setComunaId(null);
      setCategoriaId(null);
      setProductos([]);
      setDraft(EMPTY_DRAFT);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la publicación.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
      <Pressable onPress={handlePickLogo} style={styles.avatarWrapper}>
        {logo ? (
          <Image source={{ uri: logo.uri }} style={styles.avatarImage} contentFit="cover" />
        ) : (
          <View style={styles.avatarPlaceholder} />
        )}
      </Pressable>

      <TextField label="Nombre" value={nombre} onChangeText={setNombre} autoCapitalize="words" />

      <PickerField
        label="Comuna"
        value={comunaNombre}
        open={pickerOpen === 'comuna'}
        onToggle={() => setPickerOpen((p) => (p === 'comuna' ? null : 'comuna'))}
        options={comunas.map((c) => ({ id: c.id, label: c.nombre }))}
        onSelect={(id) => {
          setComunaId(id);
          setPickerOpen(null);
        }}
      />

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

      <TextField
        label="Teléfono"
        value={telefono}
        onChangeText={setTelefono}
        keyboardType="phone-pad"
        hint="9 1234 5678 (sin el +56, lo agregamos nosotros)"
      />

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
  );
}

function PickerField({
  label,
  value,
  open,
  onToggle,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  options: { id: string; label: string }[];
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.pickerContainer}>
      <Pressable onPress={onToggle} style={styles.pickerRow}>
        <Text style={value ? styles.pickerValue : styles.pickerPlaceholder}>{value || label}</Text>
        <Text style={styles.pickerChevron}>{open ? '︿' : '﹀'}</Text>
      </Pressable>

      {open && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerOptions}>
          {options.map((option) => (
            <Pressable key={option.id} onPress={() => onSelect(option.id)} style={styles.pickerOption}>
              <Text style={styles.pickerOptionLabel}>{option.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
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
  logo: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
  },
  logoAccent: {
    color: Colors.accent,
  },
  eyebrow: {
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
    marginTop: Spacing.three,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.cardText,
  },
  guestMessage: {
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
  pickerContainer: {
    marginTop: Spacing.four,
  },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.inputBorder,
    paddingBottom: Spacing.two,
  },
  pickerValue: {
    fontSize: 16,
    color: Colors.cardText,
  },
  pickerPlaceholder: {
    fontSize: 16,
    color: Colors.placeholder,
  },
  pickerChevron: {
    color: Colors.textMuted,
  },
  pickerOptions: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  pickerOption: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F1F1F1',
  },
  pickerOptionLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: Colors.cardText,
  },
  sectionLabel: {
    marginTop: Spacing.five,
    marginBottom: Spacing.two,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: Colors.cardTextMuted,
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
    fontSize: 15,
    fontWeight: '700',
    color: Colors.cardText,
  },
  productoPrecio: {
    fontSize: 13,
    color: Colors.cardTextMuted,
    marginTop: 2,
  },
  productoInput: {
    fontSize: 15,
    color: Colors.cardText,
    paddingVertical: 2,
  },
  productoInputMuted: {
    fontSize: 13,
    color: Colors.cardTextMuted,
  },
  productoQuitar: {
    fontSize: 12,
    color: Colors.danger,
    fontWeight: '600',
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
});
