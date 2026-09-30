import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/ui/Texto';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { ComunaFieldPicker } from '@/components/forms/ComunaFieldPicker';
import { PickerField } from '@/components/forms/PickerField';
import { EmptyState, ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { Button } from '@/components/ui/Button';
import { LienzoPublicacion, useMedidaProducto } from '@/components/forms/LienzoPublicacion';
import { TextField } from '@/components/ui/TextField';
import { Colors, Fonts, Spacing } from '@/constants/theme';
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

/** Mismos topes que al publicar (documento EDIT APP). */
const MAX_NOMBRE_PRODUCTO = 22;
const MAX_DIGITOS_PRECIO = 9;

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

  // Con la publicación cargada, el mismo diseño que publicar: negro arriba,
  // tarjeta blanca y la foto montada sobre su borde.
  if (!loading && !error && publicacion) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <EditarForm
          publicacion={publicacion}
          comunas={comunas}
          categorias={categorias}
          onDeleted={() => router.back()}
          onVolver={() => router.back()}
        />
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <EncabezadoMarca subtitulo="Editar publicación" onVolver={() => router.back()} />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && !publicacion && (
        <EmptyState title="No encontramos esta publicación" message="Puede que ya no exista." />
      )}
    </SafeAreaView>
  );
}

function EditarForm({
  publicacion,
  comunas,
  categorias,
  onDeleted,
  onVolver,
}: {
  publicacion: PublicacionDetalle;
  comunas: Comuna[];
  categorias: Categoria[];
  onDeleted: () => void;
  onVolver: () => void;
}) {
  const medidaProducto = useMedidaProducto();
  const [titulo, setTitulo] = useState(publicacion.titulo);
  const [telefono, setTelefono] = useState(publicacion.telefono);
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
    const precioNumero = Number(draft.precio.replace(/[^\d]/g, '')) || 0;
    // El precio es opcional: sin él se guarda en 0 y no se muestra.
    if (draft.nombre.trim().length === 0 && !draft.image) {
      setError('Ponle un nombre o una foto al producto antes de agregarlo.');
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
    // Mismo formato que exige la base (migración 0007): +569 y ocho dígitos.
    const telefonoLimpio = telefono.replace(/[^\d+]/g, '');
    if (!/^\+569\d{8}$/.test(telefonoLimpio)) {
      setError('El teléfono tiene que ser +569 y ocho dígitos, por ejemplo +56912345678.');
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
        telefono: telefonoLimpio,
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

  return (
    <LienzoPublicacion fotoUri={logo?.uri ?? logoUrl ?? null} onElegirFoto={handlePickLogo} onVolver={onVolver}>
      <TextField
        label="Nombre"
        value={titulo}
        onChangeText={setTitulo}
        autoCapitalize="words"
        style={styles.nombre}
        estiloContenedor={styles.filaCampo}
      />

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

      <TextField
        label="Teléfono"
        value={telefono}
        onChangeText={setTelefono}
        keyboardType="phone-pad"
        autoComplete="tel"
        estiloContenedor={styles.filaCampo}
      />

      {/* Los productos que ya tiene. */}
      {productos.map((producto) => (
        <View key={producto.id} style={styles.productoFila}>
          {producto.imagen_url ? (
            <Image source={{ uri: producto.imagen_url }} style={[styles.productoFoto, medidaProducto]} contentFit="cover" />
          ) : (
            <View style={[styles.productoFoto, medidaProducto, styles.productoFotoVacia]} />
          )}
          <View style={styles.productoTextos}>
            <Text style={styles.productoNombre} numberOfLines={1}>
              {producto.nombre || 'Producto'}
            </Text>
            <Text style={styles.productoPrecio}>
              {producto.precio > 0 ? `$${producto.precio.toLocaleString('es-CL')}` : 'Sin precio'}
            </Text>
          </View>
          <Pressable onPress={() => handleQuitarExistente(producto.id)} hitSlop={8}>
            <Text style={styles.quitar}>Quitar</Text>
          </Pressable>
        </View>
      ))}

      {/* Uno nuevo: foto, nombre y precio. */}
      {productos.length < 5 && (
        <View style={styles.productoFila}>
          <Pressable onPress={handlePickProductoImage}>
            {draft.image ? (
              <Image source={{ uri: draft.image.uri }} style={[styles.productoFoto, medidaProducto]} contentFit="cover" />
            ) : (
              <View style={[styles.productoFoto, medidaProducto, styles.productoFotoVacia]} />
            )}
          </Pressable>
          <View style={styles.productoTextos}>
            <TextInput
              placeholder="Producto"
              placeholderTextColor={Colors.cardText}
              value={draft.nombre}
              onChangeText={(text) => setDraft((d) => ({ ...d, nombre: text.slice(0, MAX_NOMBRE_PRODUCTO) }))}
              maxLength={MAX_NOMBRE_PRODUCTO}
              style={styles.productoNombreInput}
            />
            <TextInput
              placeholder="Precio"
              placeholderTextColor={Colors.cardText}
              value={draft.precio}
              onChangeText={(text) =>
                setDraft((d) => ({ ...d, precio: text.replace(/[^0-9]/g, '').slice(0, MAX_DIGITOS_PRECIO) }))
              }
              keyboardType="number-pad"
              maxLength={MAX_DIGITOS_PRECIO}
              style={styles.productoPrecioInput}
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

      <Pressable onPress={handleEliminarPublicacion} style={styles.eliminar}>
        <Text style={styles.eliminarLabel}>Eliminar publicación</Text>
      </Pressable>
    </LienzoPublicacion>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  nombre: {
    textAlign: 'center',
  },
  // Todas las filas a la misma distancia, como la maqueta.
  filaCampo: {
    marginTop: Spacing.three,
  },
  productoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
  productoFoto: {
    borderRadius: 8,
  },
  productoFotoVacia: {
    backgroundColor: '#B3B3B3',
  },
  productoTextos: {
    flex: 1,
  },
  productoNombre: {
    fontFamily: Fonts.light,
    fontSize: 21,
    color: Colors.cardText,
  },
  productoPrecio: {
    fontFamily: Fonts.light,
    marginTop: 2,
    fontSize: 17,
    color: Colors.cardTextMuted,
  },
  productoNombreInput: {
    fontFamily: Fonts.light,
    fontSize: 21,
    color: Colors.cardText,
    paddingVertical: 2,
  },
  productoPrecioInput: {
    fontFamily: Fonts.light,
    fontSize: 17,
    color: Colors.cardText,
    paddingVertical: 2,
  },
  quitar: {
    fontFamily: Fonts.light,
    fontSize: 13,
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
  eliminar: {
    marginTop: Spacing.four,
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  eliminarLabel: {
    fontFamily: Fonts.light,
    fontSize: 15,
    color: Colors.danger,
  },
});
