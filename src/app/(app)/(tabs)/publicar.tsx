import { Image } from 'expo-image';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/ui/Texto';

import { ComunaFieldPicker } from '@/components/forms/ComunaFieldPicker';
import { PickerField } from '@/components/forms/PickerField';
import { Button } from '@/components/ui/Button';
import { TarjetaClaraProvider } from '@/components/ui/TarjetaClara';
import { LienzoPublicacion, useMedidaProducto } from '@/components/forms/LienzoPublicacion';
import { TextField } from '@/components/ui/TextField';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import {
  Categoria,
  Comuna,
  MiPublicacion,
  crearPublicacion,
  fetchCategorias,
  fetchComunas,
  fetchMisPublicaciones,
} from '@/lib/catalog';
import { MENSAJE_CELULAR, celularLocal, isValidChileanPhone, normalizeChileanPhone, soloCelular } from '@/lib/validation';
import { getErrorMessage } from '@/lib/errors';
import { PickedImage, pickAndCompressImage, uploadCompressedImage } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/SessionProvider';
import { FotoRemota } from '@/components/ui/FotoRemota';

type ProductoDraft = {
  nombre: string;
  precio: string;
  image: PickedImage | null;
};

const EMPTY_DRAFT: ProductoDraft = { nombre: '', precio: '', image: null };

/**
 * Tope de caracteres del nombre del producto (pedido del cliente). Si en la
 * tarjeta no cabe junto al precio, se desliza para leerlo entero.
 */
const MAX_NOMBRE_PRODUCTO = 100;
/** Hasta 8 dígitos: el precio máximo es $99.999.999 (pedido del cliente). */
const MAX_DIGITOS_PRECIO = 8;

/**
 * Publicar un comercio, con el diseño de la maqueta del cliente: fondo gris
 * claro, una tarjeta blanca con los campos en líneas —comuna, categoría y
 * teléfono—, la foto del comercio redonda y montada sobre el
 * borde de la tarjeta, la fila del producto con su recuadro de foto, y abajo
 * los dos botones: "Agregar" en rojo y "Subir" en negro.
 */
export default function PublicarScreen() {
  const { session, profile } = useSession();
  // La foto del comercio: la elige la pantalla y la usa el formulario.
  const [logo, setLogo] = useState<PickedImage | null>(null);

  async function elegirFoto() {
    try {
      const image = await pickAndCompressImage({ uso: 'logo' });
      if (image) setLogo(image);
    } catch {
      // Si la galería no abre, se sigue sin foto: no es obligatoria.
    }
  }

  if (!session) {
    return (
      <TarjetaClaraProvider value>
        <View style={styles.sinSesion}>
          <GuestGate />
        </View>
      </TarjetaClaraProvider>
    );
  }

  // Los administradores no publican comercios (pedido del cliente): si llegan
  // acá de alguna forma, vuelven al inicio. Mientras el perfil no llega, no
  // se muestra el formulario.
  if (!profile) return null;
  if (profile.rol === 'admin' || profile.rol === 'admin_zona') {
    return <Redirect href="/(app)/(tabs)/dashboard" />;
  }

  return (
    <LienzoPublicacion fotoUri={logo?.uri ?? null} onElegirFoto={elegirFoto}>
      <PublicarForm
        nombrePerfil={profile?.nombre ?? ''}
        telefonoContacto={profile?.telefono_contacto ?? null}
        logo={logo}
        onLogoUsado={() => setLogo(null)}
      />
    </LienzoPublicacion>
  );
}

function GuestGate() {
  const router = useRouter();
  return (
    <View style={styles.guest}>
      <View style={styles.fotoInvitado} />
      <Text style={styles.guestTitle}>Inicia sesión para publicar</Text>
      <Text style={styles.guestMessage}>Publicar tu negocio en Kheep es gratis, pero necesitas una cuenta.</Text>
      <Button label="Ingresar" onPress={() => router.push('/(auth)/login')} />
      <Button label="Registrar" variant="secondary" onPress={() => router.push('/(auth)/register')} />
    </View>
  );
}

function PublicarForm({
  nombrePerfil,
  telefonoContacto,
  logo,
  onLogoUsado,
}: {
  /**
   * El nombre del comercio es el de su perfil: no se escribe de nuevo al
   * publicar (pedido del cliente). Si cambia en el perfil, cambia en todas
   * sus publicaciones.
   */
  nombrePerfil: string;
  telefonoContacto: string | null;
  logo: PickedImage | null;
  onLogoUsado: () => void;
}) {
  const medidaProducto = useMedidaProducto();
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

  /** Arranca con el del perfil, pero se puede cambiar solo para este comercio. */
  const [telefono, setTelefono] = useState(celularLocal(telefonoContacto));

  const [comunas, setComunas] = useState<Comuna[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [comunaId, setComunaId] = useState<string | null>(null);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState<'categoria' | null>(null);

  // Todos los productos se pueden editar en todo momento, también los ya
  // agregados: cada fila es foto, nombre y precio editables. "Agregar" suma
  // una fila vacía debajo.
  const [productos, setProductos] = useState<ProductoDraft[]>([EMPTY_DRAFT]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchComunas().then(setComunas).catch(() => {});
    fetchCategorias().then(setCategorias).catch(() => {});
  }, []);

  useEffect(() => {
    if (telefonoContacto) setTelefono((actual) => actual || celularLocal(telefonoContacto));
  }, [telefonoContacto]);

  const categoriaNombre = categorias.find((c) => c.id === categoriaId)?.nombre ?? '';

  const tieneAlgo = (p: ProductoDraft) => p.nombre.trim().length > 0 || !!p.image || p.precio.length > 0;

  function cambiarProducto(index: number, cambio: Partial<ProductoDraft>) {
    setProductos((list) => list.map((p, i) => (i === index ? { ...p, ...cambio } : p)));
  }

  async function handlePickProductoImage(index: number) {
    try {
      const image = await pickAndCompressImage({ uso: 'producto' });
      if (image) cambiarProducto(index, { image });
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo abrir la galería.'));
    }
  }

  function handleAgregarProducto() {
    setError(null);
    const ultimo = productos[productos.length - 1];
    if (ultimo && ultimo.nombre.trim().length === 0 && !ultimo.image) {
      setError('Ponle un nombre o una foto al producto antes de agregar otro.');
      return;
    }
    if (productos.length >= 5) {
      setError('Máximo 5 productos por publicación.');
      return;
    }
    setProductos((list) => [...list, EMPTY_DRAFT]);
  }

  function handleQuitarProducto(index: number) {
    // Siempre queda al menos una fila para escribir.
    setProductos((list) => {
      const resto = list.filter((_, i) => i !== index);
      return resto.length > 0 ? resto : [EMPTY_DRAFT];
    });
  }

  async function handleGuardar() {
    setError(null);
    setSuccess(null);

    if (nombrePerfil.trim().length === 0) {
      setError('Primero ponle nombre a tu perfil: es el que aparece en la publicación.');
      return;
    }
    // Se escribe 9 y ocho dígitos; se guarda con el +56 (formato de la base, 0007).
    if (!isValidChileanPhone(telefono)) {
      setError(MENSAJE_CELULAR);
      return;
    }
    const telefonoLimpio = normalizeChileanPhone(telefono);
    // Obligatorios (pedido del cliente): la foto del comercio, la comuna, la
    // categoría y la foto de cada producto. Sin ellos la tarjeta del inicio
    // queda a medias.
    if (!logo) {
      setError('Sube la foto de tu comercio (el círculo de arriba).');
      return;
    }
    if (!comunaId) {
      setError('Elige la comuna.');
      return;
    }
    if (!categoriaId) {
      setError('Elige la categoría.');
      return;
    }
    const conContenido = productos.filter(tieneAlgo);
    if (conContenido.length === 0) {
      setError('Agrega al menos un producto con su foto.');
      return;
    }
    if (conContenido.some((p) => !p.image)) {
      setError('Cada producto necesita su foto.');
      return;
    }

    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user!.id;

      const logoUrl = logo ? await uploadCompressedImage('logos', userId, logo, 'logo') : null;

      // Las filas vacías no se suben. El precio es opcional (documento EDIT
      // APP): sin precio va en 0 y la tarjeta no muestra nada donde iría.
      const productosConUrl = await Promise.all(
        productos.filter(tieneAlgo).map(async (producto, index) => ({
          nombre: producto.nombre.trim(),
          precio: Number(producto.precio) || 0,
          imagen_url: producto.image ? await uploadCompressedImage('productos', userId, producto.image, `producto-${index}`) : null,
        })),
      );

      await crearPublicacion({
        titulo: nombrePerfil.trim(),
        categoriaId,
        comunaId,
        logoUrl,
        telefono: telefonoLimpio,
        productos: productosConUrl,
      });

      setSuccess('¡Listo! Tu publicación fue creada. Si tu cuenta está en revisión, un admin la va a aprobar pronto.');
      onLogoUsado();
      setComunaId(null);
      setCategoriaId(null);
      setProductos([EMPTY_DRAFT]);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo guardar la publicación.'));
    } finally {
      setSaving(false);
    }
  }

  // `FormScroll` resuelve el teclado igual que en toda la app: reserva su
  // alto y corre el formulario si el campo enfocado quedaría tapado.
  return (
    <>
      <ComunaFieldPicker label="Comuna" comunas={comunas} selectedId={comunaId} onSelect={setComunaId} />

      <PickerField
        label="Categoría"
        value={categoriaNombre}
        open={pickerOpen === 'categoria'}
        onToggle={() => setPickerOpen((p) => (p === 'categoria' ? null : 'categoria'))}
        options={categorias.map((c) => ({ id: c.id, label: c.nombre }))}
        onSelect={(id) => {
          setCategoriaId(id);
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

      {/* Los productos: todos editables siempre, también los ya agregados. */}
      {productos.map((producto, index) => (
        <View key={index} style={styles.productoFila}>
          <Pressable onPress={() => handlePickProductoImage(index)}>
            {producto.image ? (
              <Image source={{ uri: producto.image.uri }} style={[styles.productoFoto, medidaProducto]} contentFit="cover" />
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
      ))}

      <Button label="Agregar" onPress={handleAgregarProducto} />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {success ? <Text style={styles.successText}>{success}</Text> : null}

      {saving ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.three }} />
      ) : (
        <Button label="Subir" variant="secondary" onPress={handleGuardar} />
      )}

      {/* Lo que ya está publicado, al final: acá se entra a editarlo. */}
      {!misPublicacionesLoading && misPublicaciones.some((p) => p.estado !== 'pendiente') && (
        <View style={styles.misPublicaciones}>
          <Text style={styles.seccion}>MIS PUBLICACIONES</Text>
          {/* Solo las aprobadas y las rechazadas (pedido del cliente): las
              aprobadas se editan en el texto; las rechazadas se corrigen y se
              reenvían. */}
          {misPublicaciones.filter((p) => p.estado !== 'pendiente').map((publicacion) => (
            <Pressable
              key={publicacion.id}
              style={styles.productoFila}
              onPress={() => router.push({ pathname: '/(app)/publicacion/editar/[id]', params: { id: publicacion.id } })}>
              {publicacion.logo_url ? (
                <FotoRemota uri={publicacion.logo_url} ancho={medidaProducto.width} style={[styles.productoFoto, medidaProducto]} />
              ) : (
                <View style={[styles.productoFoto, medidaProducto, styles.productoFotoVacia]} />
              )}
              <View style={styles.productoTextos}>
                <Text style={styles.productoNombre} numberOfLines={1}>
                  {publicacion.titulo}
                </Text>
                <Text style={styles.productoPrecio}>
                  {[publicacion.categoria?.nombre, publicacion.comuna?.nombre].filter(Boolean).join(' · ') ||
                    'Sin categoría ni comuna'}
                </Text>
                {/* Por cuál foto la rechazaron, para que sepa qué cambiar. */}
                {publicacion.estado === 'rechazado' && publicacion.rechazo_foto ? (
                  <Text style={styles.rechazoFoto}>Rechazada por la imagen {publicacion.rechazo_foto}</Text>
                ) : null}
              </View>
              <EstadoBadge estado={publicacion.estado} />
            </Pressable>
          ))}
        </View>
      )}
    </>
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
  sinSesion: {
    flex: 1,
    backgroundColor: Colors.card,
  },
  fotoInvitado: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#B3B3B3',
  },
  // Todas las filas a la misma distancia, como la maqueta (un 17 % del ancho).
  filaCampo: {
    marginTop: Spacing.three,
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
    fontFamily: Fonts.semiBold,
    fontSize: 18,
    color: Colors.cardText,
  },
  rechazoFoto: {
    fontFamily: Fonts.light,
    marginTop: 2,
    fontSize: 13,
    color: Colors.danger,
  },
  productoPrecio: {
    fontFamily: Fonts.light,
    marginTop: 2,
    fontSize: 14,
    color: Colors.cardTextMuted,
  },
  productoNombreInput: {
    fontFamily: Fonts.semiBold,
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
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: Colors.danger,
  },
  misPublicaciones: {
    marginTop: Spacing.six,
  },
  seccion: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: Colors.cardTextMuted,
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
