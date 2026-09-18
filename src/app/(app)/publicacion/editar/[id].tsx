import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ComunaFieldPicker } from '@/components/forms/ComunaFieldPicker';
import { PickerField } from '@/components/forms/PickerField';
import { EmptyState, ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { Button } from '@/components/ui/Button';
import { FormScroll } from '@/components/ui/FormScroll';
import { TextField } from '@/components/ui/TextField';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import {
  Categoria,
  Comuna,
  Producto,
  PublicacionDetalle,
  actualizarPublicacion,
  crearProducto,
  eliminarProducto,
  eliminarPublicacion,
  fetchCategorias,
  fetchComunas,
  fetchPublicacionDetalle,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { PickedImage, pickAndCompressImage, uploadCompressedImage } from '@/lib/images';
import { supabase } from '@/lib/supabase';

type ProductoDraft = { nombre: string; precio: string; image: PickedImage | null };
const EMPTY_DRAFT: ProductoDraft = { nombre: '', precio: '', image: null };

export default function EditarPublicacionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [publicacion, setPublicacion] = useState<PublicacionDetalle | null>(null);
  const [comunas, setComunas] = useState<Comuna[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [detalle, comunasData, categoriasData] = await Promise.all([
        fetchPublicacionDetalle(id),
        fetchComunas(),
        fetchCategorias(),
      ]);
      setPublicacion(detalle);
      setComunas(comunasData);
      setCategorias(categoriasData);
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backLabel}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.topTitle}>Editar publicación</Text>
        <View style={{ width: 70 }} />
      </View>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && !publicacion && (
        <EmptyState title="No encontramos esta publicación" message="Puede que ya no exista." />
      )}
      {!loading && !error && publicacion && (
        <View style={styles.card}>
          <EditarForm
            publicacion={publicacion}
            comunas={comunas}
            categorias={categorias}
            onDeleted={() => router.back()}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

function EditarForm({
  publicacion,
  comunas,
  categorias,
  onDeleted,
}: {
  publicacion: PublicacionDetalle;
  comunas: Comuna[];
  categorias: Categoria[];
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [titulo, setTitulo] = useState(publicacion.titulo);
  const [logo, setLogo] = useState<PickedImage | null>(null);
  const [logoUrl, setLogoUrl] = useState(publicacion.logo_url);

  const comunaInicial = comunas.find((c) => c.nombre === publicacion.comuna?.nombre)?.id ?? null;
  const categoriaInicial = categorias.find((c) => c.nombre === publicacion.categoria?.nombre)?.id ?? null;
  const [comunaId, setComunaId] = useState<string | null>(comunaInicial);
  const [categoriaId, setCategoriaId] = useState<string | null>(categoriaInicial);
  const [pickerOpen, setPickerOpen] = useState<'categoria' | null>(null);

  const [productos, setProductos] = useState<Producto[]>(publicacion.productos);
  const [draft, setDraft] = useState<ProductoDraft>(EMPTY_DRAFT);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const categoriaNombre = categorias.find((c) => c.id === categoriaId)?.nombre ?? '';

  async function handlePickLogo() {
    try {
      const image = await pickAndCompressImage({ uso: 'logo' });
      if (image) setLogo(image);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo abrir la galería.'));
    }
  }

  async function handlePickProductoImage() {
    try {
      const image = await pickAndCompressImage({ uso: 'producto' });
      if (image) setDraft((d) => ({ ...d, image }));
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo abrir la galería.'));
    }
  }

  function handleQuitarExistente(productoId: string) {
    Alert.alert('Quitar producto', '¿Seguro que quieres quitar este producto? No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          try {
            await eliminarProducto(productoId);
            setProductos((list) => list.filter((p) => p.id !== productoId));
          } catch (err) {
            setError(getErrorMessage(err, 'No se pudo quitar el producto.'));
          }
        },
      },
    ]);
  }

  async function handleAgregarProducto() {
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

    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const imagenUrl = draft.image ? await uploadCompressedImage('productos', auth.user!.id, draft.image, `producto-${Date.now()}`) : null;
      await crearProducto(publicacion.id, {
        nombre: draft.nombre,
        precio: precioNumero,
        imagen_url: imagenUrl,
        orden: productos.length,
      });
      setProductos((list) => [
        ...list,
        { id: `${Date.now()}`, nombre: draft.nombre, descripcion: null, precio: precioNumero, imagen_url: imagenUrl, orden: list.length },
      ]);
      setDraft(EMPTY_DRAFT);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo agregar el producto.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleGuardar() {
    setError(null);
    setSuccess(null);

    if (titulo.trim().length === 0) {
      setError('Ponle un nombre a tu negocio.');
      return;
    }

    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user!.id;
      const finalLogoUrl = logo ? await uploadCompressedImage('logos', userId, logo, 'logo') : logoUrl;

      await actualizarPublicacion(publicacion.id, {
        titulo: titulo.trim(),
        categoriaId,
        comunaId,
        logoUrl: finalLogoUrl,
      });

      setLogoUrl(finalLogoUrl);
      setLogo(null);
      setSuccess('Cambios guardados.');
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudieron guardar los cambios.'));
    } finally {
      setSaving(false);
    }
  }

  function handleEliminarPublicacion() {
    Alert.alert(
      'Eliminar publicación',
      'Se va a quitar del catálogo. No se puede deshacer desde la app.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await eliminarPublicacion(publicacion.id);
              onDeleted();
            } catch (err) {
              setError(getErrorMessage(err, 'No se pudo eliminar la publicación.'));
            }
          },
        },
      ],
    );
  }

  // `FormScroll` resuelve el teclado igual que en toda la app: reserva su
  // alto y corre el formulario si el campo enfocado quedaría tapado.
  return (
    <FormScroll contentContainerStyle={styles.formContent}>
      <Pressable onPress={handlePickLogo} style={styles.avatarWrapper}>
        {logo ? (
          <Image source={{ uri: logo.uri }} style={styles.avatarImage} contentFit="cover" />
        ) : logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.avatarImage} contentFit="cover" />
        ) : (
          <View style={styles.avatarPlaceholder} />
        )}
      </Pressable>

      <TextField label="Nombre" value={titulo} onChangeText={setTitulo} autoCapitalize="words" />

      <ComunaFieldPicker label="Comuna" comunas={comunas} selectedId={comunaId} onSelect={setComunaId} />

      <PickerField
        label="Categoría"
        value={categoriaNombre}
        open={pickerOpen === 'categoria'}
        onToggle={() => setPickerOpen((p) => (p === 'categoria' ? null : 'categoria'))}
        options={categorias.map((c) => ({ id: c.id, label: c.nombre }))}
        onSelect={(categoriaSelId) => {
          setCategoriaId(categoriaSelId);
          setPickerOpen(null);
        }}
      />

      <Pressable onPress={() => router.push('/(app)/perfil/editar')}>
        <Text style={styles.telefonoNota}>
          Los interesados te van a escribir al{' '}
          <Text style={styles.telefonoNotaFuerte}>{publicacion.telefono}</Text> de tu perfil. ¿Cambió? Edítalo ahí →
        </Text>
      </Pressable>

      <Text style={styles.sectionLabel}>PRODUCTOS ({productos.length}/5)</Text>

      {productos.map((producto) => (
        <View key={producto.id} style={styles.productoRow}>
          {producto.imagen_url ? (
            <Image source={{ uri: producto.imagen_url }} style={styles.productoThumb} contentFit="cover" />
          ) : (
            <View style={[styles.productoThumb, styles.productoThumbEmpty]} />
          )}
          <View style={styles.productoInfo}>
            <Text style={styles.productoNombre} numberOfLines={1}>
              {producto.nombre}
            </Text>
            <Text style={styles.productoPrecio}>${producto.precio.toLocaleString('es-CL')}</Text>
          </View>
          <Pressable onPress={() => handleQuitarExistente(producto.id)} hitSlop={8}>
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

      <Button label="Agregar producto" onPress={handleAgregarProducto} />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {success ? <Text style={styles.successText}>{success}</Text> : null}

      {saving ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.three }} />
      ) : (
        <Button label="Guardar cambios" variant="secondary" onPress={handleGuardar} />
      )}

      <Pressable onPress={handleEliminarPublicacion} style={styles.deleteRow}>
        <Text style={styles.deleteLabel}>Eliminar publicación</Text>
      </Pressable>
    </FormScroll>
  );
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
  formContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.six,
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
  deleteRow: {
    marginTop: Spacing.five,
    alignItems: 'center',
  },
  deleteLabel: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: Colors.danger,
  },
});
