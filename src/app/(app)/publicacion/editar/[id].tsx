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
  actualizarProducto,
  crearProducto,
  eliminarProducto,
  eliminarPublicacion,
  fetchCategorias,
  fetchComunas,
  fetchPublicacionDetalle,
} from '@/lib/catalog';
import { MENSAJE_CELULAR, celularLocal, isValidChileanPhone, normalizeChileanPhone, soloCelular } from '@/lib/validation';
import { getErrorMessage } from '@/lib/errors';
import { PickedImage, pickAndCompressImage, uploadCompressedImage } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/SessionProvider';
import { FotoRemota } from '@/components/ui/FotoRemota';

/**
 * Un producto en el formulario. Todos se pueden editar en todo momento: los
 * que ya estaban (con `id`) y los nuevos. `imagenUrl` es la foto que ya
 * tiene; `image`, una foto nueva elegida y todavía sin subir.
 */
type FilaProducto = {
  id: string | null;
  nombre: string;
  precio: string;
  imagenUrl: string | null;
  image: PickedImage | null;
  cambiado: boolean;
};
const FILA_VACIA: FilaProducto = { id: null, nombre: '', precio: '', imagenUrl: null, image: null, cambiado: false };

const aFila = (p: Producto): FilaProducto => ({
  id: p.id,
  nombre: p.nombre,
  precio: p.precio > 0 ? String(p.precio) : '',
  imagenUrl: p.imagen_url,
  image: null,
  cambiado: false,
});

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
         
        />
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <EncabezadoMarca subtitulo="Editar publicación" />

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
}: {
  publicacion: PublicacionDetalle;
  comunas: Comuna[];
  categorias: Categoria[];
  onDeleted: () => void;
}) {
  const medidaProducto = useMedidaProducto();
  // El nombre es el del perfil (no se edita acá): al guardar se vuelve a
  // tomar de ahí, por si la publicación tenía uno viejo.
  const { profile } = useSession();
  // Aprobada: solo el texto (las fotos ya fueron aprobadas). Rechazada: se
  // corrige todo y se reenvía. En las dos vuelve a revisión, salvo una
  // aprobada de alguien con "Directo" (nivel 2), que sigue publicada.
  const aprobada = publicacion.estado === 'aprobado';
  const rechazada = publicacion.estado === 'rechazado';
  const vuelveARevision = rechazada || (aprobada && profile?.nivel !== 2);
  const titulo = profile?.nombre?.trim() || publicacion.titulo;
  const [telefono, setTelefono] = useState(celularLocal(publicacion.telefono));
  const [logo, setLogo] = useState<PickedImage | null>(null);
  const [logoUrl, setLogoUrl] = useState(publicacion.logo_url);

  const comunaInicial = comunas.find((c) => c.nombre === publicacion.comuna?.nombre)?.id ?? null;
  const categoriaInicial = categorias.find((c) => c.nombre === publicacion.categoria?.nombre)?.id ?? null;
  const [comunaId, setComunaId] = useState<string | null>(comunaInicial);
  const [categoriaId, setCategoriaId] = useState<string | null>(categoriaInicial);
  const [pickerOpen, setPickerOpen] = useState<'categoria' | null>(null);

  const [productos, setProductos] = useState<FilaProducto[]>(() => {
    const filas = [...publicacion.productos].sort((a, b) => a.orden - b.orden).map(aFila);
    return filas.length > 0 ? filas : [FILA_VACIA];
  });

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

  const tieneAlgo = (p: FilaProducto) =>
    p.nombre.trim().length > 0 || !!p.image || !!p.imagenUrl || p.precio.length > 0;

  function cambiarProducto(index: number, cambio: Partial<FilaProducto>) {
    setProductos((list) => list.map((p, i) => (i === index ? { ...p, ...cambio, cambiado: true } : p)));
  }

  async function handlePickProductoImage(index: number) {
    try {
      const image = await pickAndCompressImage({ uso: 'producto' });
      if (image) cambiarProducto(index, { image });
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo abrir la galería.'));
    }
  }

  /** Saca una fila; siempre queda al menos una para escribir. */
  function sacarFila(cual: (p: FilaProducto, i: number) => boolean) {
    setProductos((list) => {
      const resto = list.filter((p, i) => !cual(p, i));
      return resto.length > 0 ? resto : [FILA_VACIA];
    });
  }

  function handleQuitarProducto(index: number) {
    const fila = productos[index];
    // Uno nuevo, todavía sin guardar: se saca y listo.
    if (!fila.id) return sacarFila((_, i) => i === index);
    const productoId = fila.id;
    Alert.alert('Quitar producto', '¿Seguro que quieres quitar este producto? No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          try {
            await eliminarProducto(productoId);
            sacarFila((p) => p.id === productoId);
          } catch (err) {
            setError(getErrorMessage(err, 'No se pudo quitar el producto.'));
          }
        },
      },
    ]);
  }

  function handleAgregarProducto() {
    setError(null);
    const ultimo = productos[productos.length - 1];
    if (ultimo && !tieneAlgo(ultimo)) {
      setError('Ponle un nombre o una foto al producto antes de agregar otro.');
      return;
    }
    if (productos.length >= 5) {
      setError('Máximo 5 productos por publicación.');
      return;
    }
    setProductos((list) => [...list, FILA_VACIA]);
  }

  async function handleGuardar() {
    setError(null);
    setSuccess(null);

    if (titulo.trim().length === 0) {
      setError('Ponle un nombre a tu negocio.');
      return;
    }
    // Rechazada: para reenviarla hay que cambiar al menos una foto (el
    // rechazo es por las imágenes); el texto puede quedar igual.
    if (rechazada && !logo && !productos.some((p) => p.image)) {
      setError('Para reenviarla tienes que cambiar al menos una foto (la del comercio o la de un producto).');
      return;
    }
    // Se escribe 9 y ocho dígitos; se guarda con el +56 (formato de la base, 0007).
    if (!isValidChileanPhone(telefono)) {
      setError(MENSAJE_CELULAR);
      return;
    }
    const telefonoLimpio = normalizeChileanPhone(telefono);

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
        aRevision: vuelveARevision,
      });

      // Los productos: se guardan los nuevos y los que cambiaron. Las filas
      // vacías no se suben. El precio es opcional: sin él va en 0.
      const guardados = await Promise.all(
        productos.map(async (fila, orden): Promise<FilaProducto> => {
          if (!tieneAlgo(fila) || (fila.id && !fila.cambiado)) return fila;
          const imagenUrl = fila.image
            ? await uploadCompressedImage('productos', userId, fila.image, `producto-${Date.now()}-${orden}`)
            : fila.imagenUrl;
          const datos = { nombre: fila.nombre.trim(), precio: Number(fila.precio) || 0, imagen_url: imagenUrl };
          let id = fila.id;
          if (id) await actualizarProducto(id, datos);
          else id = await crearProducto(publicacion.id, { ...datos, orden });
          return { ...fila, id, imagenUrl, image: null, cambiado: false };
        }),
      );
      setProductos(guardados);

      setLogoUrl(finalLogoUrl);
      setLogo(null);
      setSuccess(
        vuelveARevision
          ? 'Enviada a revisión: un administrador la va a revisar antes de que vuelva a verse.'
          : 'Cambios guardados.',
      );
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
    <LienzoPublicacion fotoUri={logo?.uri ?? logoUrl ?? null} onElegirFoto={aprobada ? undefined : handlePickLogo}>
      {/* Aprobada: las fotos no se cambian (la aprobación es por ellas). */}
      {aprobada && (
        <Text style={styles.nota}>
          {vuelveARevision
            ? 'Puedes cambiar el texto, no las fotos. Al guardar vuelve a revisión.'
            : 'Puedes cambiar el texto, no las fotos.'}
        </Text>
      )}
      {rechazada && (
        <Text style={styles.nota}>
          {publicacion.rechazo_foto
            ? `Fue rechazada por la imagen ${publicacion.rechazo_foto}: cámbiala (el texto, si quieres) y reenvíala.`
            : 'Fue rechazada: cambia la foto que haga falta (el texto, si quieres) y reenvíala.'}
        </Text>
      )}

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
        onChangeText={(t) => setTelefono(soloCelular(t))}
        keyboardType="number-pad"
        maxLength={9}
        placeholder="912345678"
        estiloContenedor={styles.filaCampo}
      />

      {/* Los productos: todos editables siempre, también los que ya tenía. */}
      {productos.map((producto, index) => {
        const foto = producto.image?.uri ?? producto.imagenUrl;
        return (
          <View key={producto.id ?? `nuevo-${index}`} style={styles.productoFila}>
            <Pressable onPress={() => handlePickProductoImage(index)} disabled={aprobada}>
              {foto ? (
                <FotoRemota uri={foto} ancho={medidaProducto.width} style={[styles.productoFoto, medidaProducto]} />
              ) : (
                <View style={[styles.productoFoto, medidaProducto, styles.productoFotoVacia]} />
              )}
            </Pressable>
            <View style={styles.productoTextos}>
              <TextInput
                placeholder="Producto"
                placeholderTextColor={Colors.cardText}
                value={producto.nombre}
                onChangeText={(text) => cambiarProducto(index, { nombre: text.slice(0, MAX_NOMBRE_PRODUCTO) })}
                maxLength={MAX_NOMBRE_PRODUCTO}
                style={styles.productoNombreInput}
              />
              <TextInput
                placeholder="Precio"
                placeholderTextColor={Colors.cardText}
                value={producto.precio}
                onChangeText={(text) =>
                  cambiarProducto(index, { precio: text.replace(/[^0-9]/g, '').slice(0, MAX_DIGITOS_PRECIO) })
                }
                keyboardType="number-pad"
                maxLength={MAX_DIGITOS_PRECIO}
                style={styles.productoPrecioInput}
              />
            </View>
            {(productos.length > 1 || tieneAlgo(producto)) && (
              <Pressable onPress={() => handleQuitarProducto(index)} hitSlop={8}>
                <Text style={styles.quitar}>Quitar</Text>
              </Pressable>
            )}
          </View>
        );
      })}

      {/* Un producto nuevo trae foto: en una aprobada no se agregan. */}
      {!aprobada && <Button label="Agregar" onPress={handleAgregarProducto} />}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {success ? <Text style={styles.successText}>{success}</Text> : null}

      {saving ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.three }} />
      ) : (
        <Button label={rechazada ? 'Reenviar' : 'Guardar'} variant="secondary" onPress={handleGuardar} />
      )}

      <Pressable onPress={handleEliminarPublicacion} style={styles.eliminar}>
        <Text style={styles.eliminarLabel}>Eliminar publicación</Text>
      </Pressable>
    </LienzoPublicacion>
  );
}

const styles = StyleSheet.create({
  // Lo que se puede cambiar según cómo quedó la publicación.
  nota: {
    fontFamily: Fonts.delgada,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.cardTextMuted,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
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
