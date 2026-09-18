import { supabase } from '@/lib/supabase';

/**
 * Capa de datos de la Semana 2 (Catálogo). Todas las consultas dependen
 * enteramente de RLS para decidir qué fila se ve — el cliente nunca filtra
 * "aprobado"/"activo" por su cuenta, solo pide y confía en lo que vuelve
 * (ver migraciones 0001 y 0007).
 */

export type Banner = {
  id: string;
  imagen_url: string;
  orden: number;
};

export type Categoria = {
  id: string;
  nombre: string;
  icono: string | null;
  orden: number;
};

export type Comuna = {
  id: string;
  nombre: string;
};

export type PublicacionResumen = {
  id: string;
  titulo: string;
  descripcion: string | null;
  logo_url: string | null;
  telefono: string;
  destacado: boolean;
  categoria_id: string | null;
  categoria: { nombre: string; icono: string | null } | null;
  comuna: { nombre: string } | null;
  productos: { nombre: string; precio: number; imagen_url: string | null; orden: number }[];
};

export type Producto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  imagen_url: string | null;
  orden: number;
};

export type PublicacionDetalle = Omit<PublicacionResumen, 'productos'> & {
  productos: Producto[];
};

export type MiPublicacion = {
  id: string;
  titulo: string;
  logo_url: string | null;
  estado: 'pendiente' | 'aprobado' | 'rechazado';
  destacado: boolean;
  categoria: { nombre: string } | null;
  comuna: { nombre: string } | null;
  productos: { id: string }[];
};

/**
 * Los banners que se muestran hoy en el carrusel del catálogo.
 *
 * Los filtros van explícitos y no se delegan a las reglas de la base: a un
 * admin, esas reglas le devuelven TODOS los banners —también los vencidos y
 * los impagos— y terminaba viendo en su catálogo cosas que ningún usuario ve.
 * Es el mismo cuidado que ya se tiene con las publicaciones pendientes.
 *
 * Un banner con comuna es de esa comuna: quien paga por aparecer en Valdivia
 * no debe salir en todo Chile. Los que no tienen comuna salen en todas.
 */
export async function fetchBanners(comunaId?: string | null): Promise<Banner[]> {
  const ahora = new Date().toISOString();
  let request = supabase
    .from('banners')
    .select('id, imagen_url, orden')
    .eq('activo', true)
    .eq('pagado', true)
    .or(`fecha_inicio.is.null,fecha_inicio.lte.${ahora}`)
    .or(`fecha_fin.is.null,fecha_fin.gte.${ahora}`)
    .order('orden', { ascending: true });

  if (comunaId) {
    request = request.or(`comuna_id.is.null,comuna_id.eq.${comunaId}`);
  }

  const { data, error } = await request;
  if (error) throw error;
  return data ?? [];
}

export async function fetchComunas(): Promise<Comuna[]> {
  const { data, error } = await supabase
    .from('comunas')
    .select('id, nombre')
    .eq('activa', true)
    .order('nombre', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/**
 * Las categorías que se muestran en el catálogo.
 *
 * Cada comuna puede tener su propia lista: el admin entra a una comuna y
 * decide qué categorías van, en qué orden y cuáles oculta (ver migración
 * 0017). Mientras no haya tocado esa comuna, se usa la lista global de
 * siempre — así las ~346 comunas del país funcionan sin configurar ninguna.
 *
 * Con "Todas las comunas" (comunaId null) tampoco hay una comuna de la cual
 * sacar la lista, así que se usa la global.
 */
export async function fetchCategorias(comunaId?: string | null): Promise<Categoria[]> {
  if (comunaId) {
    const propias = await fetchCategoriasDeComuna(comunaId);
    if (propias) return propias;
  }

  const { data, error } = await supabase
    .from('categorias')
    .select('id, nombre, icono, orden')
    .eq('activa', true)
    .order('orden', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/**
 * La lista propia de una comuna, o null si esa comuna todavía usa la global.
 *
 * Se distingue "sin personalizar" de "personalizada y vacía" con la marca
 * `comunas.categorias_personalizadas`: sin ella, una comuna donde el admin
 * quitó todas las categorías sería indistinguible de una recién creada y
 * volvería a mostrar la lista global entera.
 */
async function fetchCategoriasDeComuna(comunaId: string): Promise<Categoria[] | null> {
  const { data: comuna, error: errorComuna } = await supabase
    .from('comunas')
    .select('categorias_personalizadas')
    .eq('id', comunaId)
    .maybeSingle();

  // Si falta la migración 0017, la columna no existe: el catálogo sigue
  // funcionando con la lista global en vez de quedarse sin categorías.
  if (errorComuna || !comuna?.categorias_personalizadas) return null;

  const { data, error } = await supabase
    .from('categorias_comuna')
    .select('orden, categoria:categorias(id, nombre, icono)')
    .eq('comuna_id', comunaId)
    .eq('visible', true)
    .order('orden', { ascending: true });

  if (error) return null;

  type Fila = { orden: number; categoria: { id: string; nombre: string; icono: string | null } | null };
  return ((data as unknown as Fila[]) ?? [])
    .filter((fila): fila is Fila & { categoria: NonNullable<Fila['categoria']> } => fila.categoria !== null)
    .map((fila) => ({ ...fila.categoria, orden: fila.orden }));
}

type FetchPublicacionesParams = {
  categoriaId?: string | null;
  comunaId?: string | null;
  query?: string;
};

/**
 * Lista de publicaciones del catálogo público.
 *
 * `estado`/`deleted_at` SÍ se filtran acá, aunque exista la política RLS.
 * Antes no se hacía, asumiendo que RLS bastaba — y era un error: esa
 * política dice `estado = 'aprobado' OR usuario_id = auth.uid() OR
 * is_admin()`, así que al dueño y al admin les dejaba ver sus pendientes
 * mezcladas en la vitrina, como si ya estuvieran publicadas.
 *
 * Son dos cosas distintas y hacen falta las dos: RLS decide a qué filas
 * tienes *derecho* a acceder (y ahí está bien que el dueño vea las suyas,
 * porque las necesita en "Mis publicaciones"); este filtro decide qué se
 * muestra *en el catálogo*, que es solo lo aprobado, mire quien mire.
 */
export async function fetchPublicaciones({
  categoriaId,
  comunaId,
  query,
}: FetchPublicacionesParams = {}): Promise<PublicacionResumen[]> {
  let request = supabase
    .from('publicaciones')
    .select(
      'id, titulo, descripcion, logo_url, telefono, destacado, categoria_id, categoria:categorias(nombre, icono), comuna:comunas(nombre), productos(nombre, precio, imagen_url, orden)',
    )
    .eq('estado', 'aprobado')
    .is('deleted_at', null)
    .order('destacado', { ascending: false })
    .order('orden_peso', { ascending: false });

  if (categoriaId) {
    request = request.eq('categoria_id', categoriaId);
  }
  if (comunaId) {
    request = request.eq('comuna_id', comunaId);
  }
  if (query && query.trim().length > 0) {
    request = request.ilike('titulo', `%${query.trim()}%`);
  }

  const { data, error } = await request;
  if (error) throw error;
  return (data as unknown as PublicacionResumen[]) ?? [];
}

export async function fetchPublicacionDetalle(id: string): Promise<PublicacionDetalle | null> {
  const { data, error } = await supabase
    .from('publicaciones')
    .select(
      'id, titulo, descripcion, logo_url, telefono, destacado, categoria_id, categoria:categorias(nombre), comuna:comunas(nombre), productos(id, nombre, descripcion, precio, imagen_url, orden)',
    )
    .eq('id', id)
    .order('orden', { referencedTable: 'productos', ascending: true })
    .maybeSingle();

  if (error) throw error;
  return data as unknown as PublicacionDetalle | null;
}

type NuevoProducto = {
  nombre: string;
  precio: number;
  imagen_url: string | null;
};

type NuevaPublicacion = {
  titulo: string;
  categoriaId: string | null;
  comunaId: string | null;
  logoUrl: string | null;
  productos: NuevoProducto[];
};

/**
 * Crea una publicación nueva a nombre del usuario logueado, junto con sus
 * productos. El `estado` (pendiente/aprobado) no se manda — lo decide solo
 * el trigger `fn_set_estado_publicacion` según el nivel del dueño, nunca el
 * cliente (ver migración 0001).
 *
 * El `telefono` sí se manda, tomado del perfil: la columna es NOT NULL y el
 * trigger que la rellena sola vive en la migración 0014, que puede no estar
 * aplicada todavía en un entorno dado. Mandarlo hace que publicar funcione
 * en los dos casos — donde 0014 sí está, el trigger lo reescribe con este
 * mismo valor y no cambia nada.
 */
export async function crearPublicacion(input: NuevaPublicacion): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Debes iniciar sesión para publicar.');

  const { data: perfil, error: perfilError } = await supabase
    .from('profiles')
    .select('telefono_contacto')
    .eq('id', auth.user.id)
    .single();

  if (perfilError) throw perfilError;
  if (!perfil?.telefono_contacto) {
    throw new Error('Agrega un teléfono de contacto en tu perfil antes de publicar.');
  }

  const { data: publicacion, error } = await supabase
    .from('publicaciones')
    .insert({
      usuario_id: auth.user.id,
      titulo: input.titulo,
      telefono: perfil.telefono_contacto,
      categoria_id: input.categoriaId,
      comuna_id: input.comunaId,
      logo_url: input.logoUrl,
    })
    .select('id')
    .single();

  if (error) throw error;

  if (input.productos.length > 0) {
    const { error: productosError } = await supabase.from('productos').insert(
      input.productos.map((producto, index) => ({
        publicacion_id: publicacion.id,
        nombre: producto.nombre,
        precio: producto.precio,
        imagen_url: producto.imagen_url,
        orden: index,
      })),
    );
    if (productosError) throw productosError;
  }

  return publicacion.id as string;
}

/**
 * Publicaciones del comerciante logueado — a diferencia de `fetchPublicaciones`
 * (el catálogo público), acá SÍ se ven las propias sin importar `estado`: la
 * política RLS "el dueño ve las suyas" ya lo permite. Se ocultan las que el
 * propio dueño borró (`deleted_at`) porque para él ya no existen.
 */
export async function fetchMisPublicaciones(): Promise<MiPublicacion[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await supabase
    .from('publicaciones')
    .select(
      'id, titulo, logo_url, estado, destacado, categoria:categorias(nombre), comuna:comunas(nombre), productos(id)',
    )
    .eq('usuario_id', auth.user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as unknown as MiPublicacion[]) ?? [];
}

type EditarPublicacion = {
  titulo: string;
  categoriaId: string | null;
  comunaId: string | null;
  logoUrl: string | null;
};

/**
 * Edita el contenido de una publicación propia. Nunca manda `estado` — la
 * política RLS "el dueño edita contenido, no el estado" lo rechazaría igual,
 * pero ni siquiera se intenta desde acá. Tampoco manda `telefono`: siempre
 * es el del perfil del dueño (ver migración 0014).
 */
export async function actualizarPublicacion(id: string, input: EditarPublicacion): Promise<void> {
  const { error } = await supabase
    .from('publicaciones')
    .update({
      titulo: input.titulo,
      categoria_id: input.categoriaId,
      comuna_id: input.comunaId,
      logo_url: input.logoUrl,
    })
    .eq('id', id);

  if (error) throw error;
}

/**
 * Baja lógica: el dueño no puede borrar físicamente una publicación (eso
 * queda para un admin, ver migración 0007) — solo marcarla `deleted_at`,
 * que la saca del catálogo público y de "Mis publicaciones".
 */
export async function eliminarPublicacion(id: string): Promise<void> {
  const { error } = await supabase.from('publicaciones').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function crearProducto(
  publicacionId: string,
  input: { nombre: string; precio: number; imagen_url: string | null; orden: number },
): Promise<void> {
  const { error } = await supabase.from('productos').insert({ publicacion_id: publicacionId, ...input });
  if (error) throw error;
}

export async function actualizarProducto(
  id: string,
  input: { nombre: string; precio: number; imagen_url: string | null },
): Promise<void> {
  const { error } = await supabase.from('productos').update(input).eq('id', id);
  if (error) throw error;
}

export async function eliminarProducto(id: string): Promise<void> {
  const { data, error } = await supabase.from('productos').delete().eq('id', id).select('id, imagen_url');
  if (error) throw error;
  // Igual que con los banners: sin esto, la foto del producto quedaría en el
  // almacenamiento para siempre, sin que nadie pueda verla ni encontrarla.
  await borrarImagenDeStorage('productos', (data?.[0]?.imagen_url as string | null) ?? null);
}

export type MiPerfil = {
  nombre: string;
  telefono_contacto: string | null;
  logo_url: string | null;
  comuna_id: string | null;
};

export async function fetchMiPerfil(): Promise<MiPerfil | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('nombre, telefono_contacto, logo_url, comuna_id')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

type EditarPerfil = {
  nombre: string;
  telefonoContacto: string;
  comunaId: string | null;
  logoUrl: string | null;
};

/**
 * Edita el perfil del propio comercio (nombre, teléfono, comuna, logo).
 * `rol`/`nivel` ni se mandan — la política RLS los bloquea si alguien
 * intentara tocarlos desde acá (ver migración 0001).
 */
export async function actualizarPerfil(input: EditarPerfil): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Debes iniciar sesión.');

  const { error } = await supabase
    .from('profiles')
    .update({
      nombre: input.nombre,
      telefono_contacto: input.telefonoContacto,
      comuna_id: input.comunaId,
      logo_url: input.logoUrl,
    })
    .eq('id', auth.user.id);

  if (error) throw error;
}

/**
 * Registra el clic de "Contactar por WhatsApp". No bloquea la navegación si
 * falla — perder una métrica no debe impedirle a nadie contactar al comercio.
 */
export async function logWhatsappClic(publicacionId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from('whatsapp_clics').insert({
    publicacion_id: publicacionId,
    usuario_id: auth.user?.id ?? null,
  });
  if (error) {
    console.warn('[catalog] no se pudo registrar el clic de WhatsApp:', error.message);
  }
}

// ============================================================================
// Administración: Comunas y Categorías
// ============================================================================
// Comunas: lista fija — un admin solo puede activar/desactivar cada una,
// nunca crear ni borrar (la geografía no la decide la app). Categorías: un
// admin puede crear nuevas además de activar/desactivar — es la diferencia
// que pidió el cliente entre ambas listas.

export type ComunaAdmin = {
  id: string;
  nombre: string;
  region: string;
  activa: boolean;
};

export async function fetchComunasAdmin(): Promise<ComunaAdmin[]> {
  const { data, error } = await supabase
    .from('comunas')
    .select('id, nombre, region, activa')
    .order('region', { ascending: true })
    .order('nombre', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function actualizarComunaActiva(id: string, activa: boolean): Promise<void> {
  const { error } = await supabase.from('comunas').update({ activa }).eq('id', id);
  if (error) throw error;
}

export type CategoriaAdmin = Categoria & { activa: boolean };

export async function fetchCategoriasAdmin(): Promise<CategoriaAdmin[]> {
  const { data, error } = await supabase
    .from('categorias')
    .select('id, nombre, icono, orden, activa')
    .order('orden', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function crearCategoria(input: { nombre: string; icono: string | null }): Promise<void> {
  const { data: maxOrden } = await supabase
    .from('categorias')
    .select('orden')
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('categorias').insert({
    nombre: input.nombre,
    icono: input.icono,
    orden: (maxOrden?.orden ?? 0) + 1,
  });
  if (error) throw error;
}

export async function actualizarCategoria(
  id: string,
  input: { nombre: string; icono: string | null },
): Promise<void> {
  const { error } = await supabase.from('categorias').update(input).eq('id', id);
  if (error) throw error;
}

export async function actualizarCategoriaActiva(id: string, activa: boolean): Promise<void> {
  const { error } = await supabase.from('categorias').update({ activa }).eq('id', id);
  if (error) throw error;
}

/**
 * Guarda el orden manual que define el admin: `orden` pasa a ser la posición
 * en la lista (1, 2, 3…). Las filas se actualizan todas a la vez, no una tras
 * otra — son independientes, y en serie cada flecha tardaba varios segundos
 * con la latencia del celular. Cada escritura se confirma pidiendo la fila de
 * vuelta: con RLS, un UPDATE sin permiso "tiene éxito" igual pero no cambia
 * nada.
 */
export async function guardarOrdenCategorias(idsEnOrden: string[]): Promise<void> {
  const resultados = await Promise.all(
    idsEnOrden.map((id, i) => supabase.from('categorias').update({ orden: i + 1 }).eq('id', id).select('id')),
  );
  for (const { data, error } of resultados) {
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('No se pudo guardar el orden. Revisa que tu cuenta sea de administrador.');
    }
  }
}

/** Categoría que recibe las publicaciones de las categorías que se eliminan. */
export const CATEGORIA_OTRO = 'Otro';

export async function contarPublicacionesDeCategoria(id: string): Promise<number> {
  const { count, error } = await supabase
    .from('publicaciones')
    .select('id', { count: 'exact', head: true })
    .eq('categoria_id', id);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Elimina una categoría sin dejar publicaciones huérfanas: antes de borrarla,
 * todas sus publicaciones pasan a "Otro" (que se crea sola si todavía no
 * existe). "Otro" en sí no se puede eliminar — es el destino de las demás.
 *
 * El orden importa: primero se mueven y recién después se borra. La columna
 * `publicaciones.categoria_id` tiene una FK a categorías, así que si el paso
 * de mover fallara, la base rechaza el borrado y no se pierde nada. Se mueven
 * también las publicaciones eliminadas lógicamente (`deleted_at`), porque
 * igual cuentan para esa FK.
 *
 * El borrado se confirma pidiendo la fila de vuelta: con RLS, un DELETE que
 * no afecta nada devuelve "éxito" igual, y eso no debe pasar por eliminado.
 */
/**
 * El id de la categoría "Otro", creándola si no existe y reactivándola si
 * estaba apagada: va a recibir publicaciones y, oculta, quedarían invisibles
 * para todos. Es el destino de lo que pierde su categoría, tanto al eliminar
 * una categoría de toda la app como al quitarla de una comuna.
 */
export async function obtenerCategoriaOtro(): Promise<string> {
  const { data: existente, error: buscarError } = await supabase
    .from('categorias')
    .select('id, activa')
    .ilike('nombre', CATEGORIA_OTRO)
    .limit(1)
    .maybeSingle();
  if (buscarError) throw buscarError;

  if (existente?.id) {
    if (existente.activa === false) {
      const { error: activarError } = await supabase
        .from('categorias')
        .update({ activa: true })
        .eq('id', existente.id);
      if (activarError) throw activarError;
    }
    return existente.id as string;
  }

  const { data: creada, error: crearError } = await supabase
    .from('categorias')
    .insert({ nombre: CATEGORIA_OTRO, icono: '🛍️', orden: 999, activa: true })
    .select('id')
    .single();
  if (crearError) throw crearError;
  return creada.id as string;
}

export async function eliminarCategoria(id: string): Promise<void> {
  const otroId = await obtenerCategoriaOtro();
  if (otroId === id) {
    throw new Error(`"${CATEGORIA_OTRO}" no se puede eliminar: ahí van las publicaciones de las categorías eliminadas.`);
  }

  const { error: moverError } = await supabase
    .from('publicaciones')
    .update({ categoria_id: otroId })
    .eq('categoria_id', id);
  if (moverError) throw moverError;

  const { data: borradas, error: borrarError } = await supabase
    .from('categorias')
    .delete()
    .eq('id', id)
    .select('id');
  if (borrarError) throw borrarError;
  if (!borradas || borradas.length === 0) {
    throw new Error('No se pudo eliminar la categoría. Revisa que tu cuenta sea de administrador.');
  }
}

// ============================================================================
// Banner de perfil — cada comerciante publica su propio banner
// ============================================================================
// El precio y el cobro real todavía no existen (falta elegir proveedor de
// pago) — `PRECIO_POR_DIA` y `pagarBanner()` son un paso simulado a
// propósito. Cuando se conecte un proveedor real, `pagarBanner` deja de
// existir tal cual: el pago se confirma desde un webhook del proveedor, no
// desde la app — ver la nota en la migración 0012.
export type BannerAdmin = {
  id: string;
  imagen_url: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  pagado: boolean;
  autor: { nombre: string } | null;
  comuna: { nombre: string } | null;
};

/**
 * Banners que hoy se están mostrando en la app, para el panel admin. El
 * filtro de "activo y vigente" va acá explícito: al admin, RLS le devuelve
 * todos los banners (también vencidos y pendientes de pago), y sin este
 * filtro la lista mezclaría banners que ya nadie ve.
 */
export async function fetchBannersActivosAdmin(): Promise<BannerAdmin[]> {
  const ahora = new Date().toISOString();
  const { data, error } = await supabase
    .from('banners')
    .select(
      'id, imagen_url, fecha_inicio, fecha_fin, pagado, autor:profiles!banners_usuario_id_fkey(nombre), comuna:comunas(nombre)',
    )
    .eq('activo', true)
    .or(`fecha_inicio.is.null,fecha_inicio.lte.${ahora}`)
    .or(`fecha_fin.is.null,fecha_fin.gte.${ahora}`)
    .order('orden', { ascending: true });
  if (error) throw error;
  return (data as unknown as BannerAdmin[]) ?? [];
}

// ============================================================================
// Limpieza de imágenes sin usar
// ============================================================================

/** Un archivo del almacenamiento al que ya no apunta ninguna fila. */
export type ImagenHuerfana = {
  bucket: BucketImagen;
  /** Ruta dentro del bucket: {usuario}/{archivo}. */
  ruta: string;
  nombre: string;
  bytes: number;
  creada: string | null;
};

export type BucketImagen = 'logos' | 'productos' | 'banners';

/**
 * Margen antes de considerar huérfano un archivo recién subido.
 *
 * El flujo es: se sube la imagen y DESPUÉS se crea la fila que la referencia.
 * Entre ambos pasos hay unos segundos en que el archivo existe y todavía no lo
 * apunta nadie; sin este margen, una limpieza que cayera justo ahí borraría una
 * imagen en pleno uso. Dos días cubren eso de sobra, y también al comerciante
 * que deja un formulario a medias y lo retoma al día siguiente.
 */
const HORAS_DE_GRACIA = 48;

/**
 * Los archivos de los logos temáticos viven en el bucket de banners, junto con
 * los banners de verdad. Se reconocen por el prefijo que les pone la app al
 * subirlos, y quedan SIEMPRE fuera de la limpieza: un logo vencido se reutiliza
 * al año siguiente, y es además al que la app vuelve cuando caduca el de
 * encima. Borrarlo rompería esa cadena.
 */
const PREFIJO_LOGO_TEMATICO = 'logo-tematico';

/** Nombre del archivo dentro de una URL pública nuestra, o null si es externa. */
function archivoDeUrl(url: string | null): string | null {
  if (!url) return null;
  const i = url.indexOf('/storage/v1/object/public/');
  if (i === -1) return null;
  return url.slice(url.lastIndexOf('/') + 1);
}

/**
 * Busca imágenes que ya no usa nadie: están en el almacenamiento pero ninguna
 * fila las referencia.
 *
 * NO borra nada: devuelve la lista para que el admin vea qué se iría antes de
 * decidir. Borrar archivos no se deshace, así que el barrido propone y la
 * persona dispone.
 */
export async function buscarImagenesHuerfanas(): Promise<ImagenHuerfana[]> {
  // Todo lo que alguien referencia hoy, de todas las tablas que guardan
  // imágenes. Si algún día se agrega otra tabla con imágenes, HAY QUE
  // sumarla acá: lo que no esté en esta lista se considerará basura.
  const referencias = await Promise.all([
    supabase.from('profiles').select('logo_url'),
    supabase.from('publicaciones').select('logo_url'),
    supabase.from('productos').select('imagen_url'),
    supabase.from('banners').select('imagen_url'),
    supabase.from('logos_tematicos').select('imagen_url'),
  ]);

  const enUso = new Set<string>();
  for (const { data } of referencias) {
    for (const fila of (data as Record<string, string | null>[] | null) ?? []) {
      const archivo = archivoDeUrl(fila.logo_url ?? fila.imagen_url ?? null);
      if (archivo) enUso.add(archivo);
    }
  }

  const limite = Date.now() - HORAS_DE_GRACIA * 60 * 60 * 1000;
  const huerfanas: ImagenHuerfana[] = [];

  for (const bucket of ['logos', 'productos', 'banners'] as BucketImagen[]) {
    // El almacenamiento guarda una carpeta por usuario, así que hay que entrar
    // en cada una: el listado de la raíz solo devuelve carpetas.
    const { data: carpetas } = await supabase.storage.from(bucket).list('', { limit: 1000 });
    for (const carpeta of carpetas ?? []) {
      if (carpeta.id !== null) continue;
      const { data: archivos } = await supabase.storage.from(bucket).list(carpeta.name, { limit: 1000 });

      for (const archivo of archivos ?? []) {
        if (archivo.id === null) continue;
        if (enUso.has(archivo.name)) continue;
        if (archivo.name.startsWith(PREFIJO_LOGO_TEMATICO)) continue;

        const creada = archivo.created_at ?? null;
        if (creada && new Date(creada).getTime() > limite) continue;

        huerfanas.push({
          bucket,
          ruta: `${carpeta.name}/${archivo.name}`,
          nombre: archivo.name,
          bytes: (archivo.metadata as { size?: number } | null)?.size ?? 0,
          creada,
        });
      }
    }
  }

  return huerfanas;
}

/** Borra las imágenes indicadas. No se puede deshacer. */
export async function eliminarImagenesHuerfanas(imagenes: ImagenHuerfana[]): Promise<number> {
  let borradas = 0;
  for (const bucket of ['logos', 'productos', 'banners'] as BucketImagen[]) {
    const rutas = imagenes.filter((i) => i.bucket === bucket).map((i) => i.ruta);
    if (rutas.length === 0) continue;
    const { error } = await supabase.storage.from(bucket).remove(rutas);
    if (error) throw error;
    borradas += rutas.length;
  }
  return borradas;
}

// ----------------------------------------------------------------------------
// Retención: contenido viejo que ya no sirve
// ----------------------------------------------------------------------------

/** Meses que se conserva lo vencido antes de poder purgarlo. */
export const MESES_DE_RETENCION = 6;

export type Purgables = {
  /** Clics de más de 90 días, que pasarían a ser totales por día. */
  clics: number;
  bannersVencidos: number;
  publicacionesBorradas: number;
};

/**
 * Cuánto hay hoy en condiciones de purgarse. No borra nada: la app lo muestra
 * para que el admin decida viendo los números.
 */
export async function contarPurgables(): Promise<Purgables> {
  const { data, error } = await supabase.rpc('contar_purgables', { p_meses: MESES_DE_RETENCION });
  if (error) throw error;
  const fila = (Array.isArray(data) ? data[0] : data) as
    | { clics_a_comprimir: number; banners_vencidos: number; publicaciones_borradas: number }
    | undefined;
  return {
    clics: Number(fila?.clics_a_comprimir ?? 0),
    bannersVencidos: Number(fila?.banners_vencidos ?? 0),
    publicacionesBorradas: Number(fila?.publicaciones_borradas ?? 0),
  };
}

/**
 * Resume los clics viejos en totales por día y borra el detalle. Las métricas
 * siguen mostrando lo mismo; lo que desaparece es el peso muerto.
 */
export async function comprimirClicsAntiguos(): Promise<number> {
  const { data, error } = await supabase.rpc('comprimir_clics_antiguos', { p_dias: 90 });
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Borra los banners que vencieron hace más de medio año, con su imagen.
 *
 * Medio año y no un mes: un comerciante que renueva su campaña en temporada
 * quiere su mismo diseño, y recuperarlo es imposible una vez borrado.
 */
export async function purgarBannersVencidos(): Promise<number> {
  const corte = new Date();
  corte.setMonth(corte.getMonth() - MESES_DE_RETENCION);

  const { data, error } = await supabase
    .from('banners')
    .delete()
    .lt('fecha_fin', corte.toISOString())
    .not('fecha_fin', 'is', null)
    .select('id, imagen_url');
  if (error) throw error;

  for (const banner of data ?? []) {
    await borrarImagenDeStorage('banners', (banner.imagen_url as string | null) ?? null);
  }
  return data?.length ?? 0;
}

/**
 * Borra de verdad las publicaciones que se dieron de baja hace más de medio
 * año, con su logo y las fotos de sus productos.
 *
 * Las fotos se buscan ANTES de borrar la publicación: los productos se van en
 * cascada con ella, y después ya no habría forma de saber qué archivos eran.
 */
export async function purgarPublicacionesBorradas(): Promise<number> {
  const corte = new Date();
  corte.setMonth(corte.getMonth() - MESES_DE_RETENCION);

  const { data: viejas, error: errorBuscar } = await supabase
    .from('publicaciones')
    .select('id, logo_url, productos(imagen_url)')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', corte.toISOString());
  if (errorBuscar) throw errorBuscar;
  if (!viejas || viejas.length === 0) return 0;

  const { error: errorBorrar } = await supabase
    .from('publicaciones')
    .delete()
    .in('id', viejas.map((p) => p.id as string));
  if (errorBorrar) throw errorBorrar;

  type Vieja = { logo_url: string | null; productos: { imagen_url: string | null }[] | null };
  for (const publicacion of viejas as unknown as Vieja[]) {
    await borrarImagenDeStorage('logos', publicacion.logo_url);
    for (const producto of publicacion.productos ?? []) {
      await borrarImagenDeStorage('productos', producto.imagen_url);
    }
  }
  return viejas.length;
}

/**
 * Borra del almacenamiento la imagen a la que apunta una URL pública nuestra.
 * Es "mejor esfuerzo": si falla, no se interrumpe nada — la fila ya se borró
 * y lo peor que pasa es que quede un archivo sin usar. Ignora URLs externas
 * (por ejemplo las de prueba de placehold.co), que no viven en nuestro
 * almacenamiento.
 */
async function borrarImagenDeStorage(bucket: 'logos' | 'productos' | 'banners', url: string | null) {
  if (!url) return;
  const marca = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marca);
  if (i === -1) return;
  try {
    await supabase.storage.from(bucket).remove([url.slice(i + marca.length)]);
  } catch {
    // Sin ruido: no vale la pena fallar un borrado por un archivo suelto.
  }
}

/**
 * Se confirma pidiendo la fila de vuelta: con RLS, un DELETE sin permiso
 * "tiene éxito" igual. Después se borra también la imagen: si solo se
 * borrara la fila, el archivo quedaría para siempre ocupando espacio sin que
 * nadie pueda verlo ni encontrarlo.
 */
export async function eliminarBanner(id: string): Promise<void> {
  const { data, error } = await supabase.from('banners').delete().eq('id', id).select('id, imagen_url');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo eliminar el banner.');
  await borrarImagenDeStorage('banners', data[0].imagen_url as string | null);
}

export const PRECIO_BANNER_POR_DIA = 500;

export type MiBanner = {
  id: string;
  imagen_url: string;
  comuna_id: string | null;
  comuna: { nombre: string } | null;
  dias: number | null;
  pagado: boolean;
  activo: boolean;
  fecha_fin: string | null;
};

export async function fetchMisBanners(): Promise<MiBanner[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await supabase
    .from('banners')
    .select('id, imagen_url, comuna_id, comuna:comunas(nombre), dias, pagado, activo, fecha_fin')
    .eq('usuario_id', auth.user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as unknown as MiBanner[]) ?? [];
}

export async function crearBanner(input: {
  imagenUrl: string;
  comunaId: string | null;
  dias: number;
  /**
   * El banner nace ya pagado. Es para los banners del propio admin: no pasan
   * por el cobro, y sin esto quedaban sin pagar y por lo tanto invisibles en
   * el catálogo, aunque el panel dijera que estaban activos.
   */
  pagado?: boolean;
}): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Debes iniciar sesión.');

  const { data, error } = await supabase
    .from('banners')
    .insert({
      usuario_id: auth.user.id,
      imagen_url: input.imagenUrl,
      comuna_id: input.comunaId,
      dias: input.dias,
      pagado: input.pagado ?? false,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
}

/**
 * Paso de pago SIMULADO — ver nota arriba. Marca `pagado=true`; el trigger
 * `fn_banner_activar_pago` calcula fecha_inicio/fecha_fin y activa el
 * banner (para un admin, `crearBanner` ya lo deja activo directamente y
 * este paso ni se llama).
 */
export async function pagarBanner(id: string): Promise<void> {
  const { error } = await supabase.from('banners').update({ pagado: true }).eq('id', id);
  if (error) throw error;
}

// ============================================================================
// Moderación (Panel Admin) — Semana 4
// ============================================================================

export type PublicacionPendiente = {
  id: string;
  titulo: string;
  descripcion: string | null;
  logo_url: string | null;
  telefono: string;
  created_at: string;
  categoria: { nombre: string } | null;
  comuna: { nombre: string } | null;
  autor: { nombre: string; nivel: number } | null;
};

/**
 * Publicaciones esperando revisión — solo un admin puede verlas todas (la
 * política RLS "catálogo público solo muestra aprobadas" ya se encarga de
 * que nadie más pueda leer esta lista completa).
 */
export async function fetchPublicacionesPendientes(): Promise<PublicacionPendiente[]> {
  const { data, error } = await supabase
    .from('publicaciones')
    .select(
      'id, titulo, descripcion, logo_url, telefono, created_at, categoria:categorias(nombre), comuna:comunas(nombre), autor:profiles!publicaciones_usuario_id_fkey(nombre, nivel)',
    )
    .eq('estado', 'pendiente')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data as unknown as PublicacionPendiente[]) ?? [];
}

/**
 * Aprobar/rechazar SOLO cambia `estado` — el trigger `fn_log_moderacion` se
 * encarga solo de anotar quién y cuándo en `moderacion_historial`, nunca lo
 * hace la app a mano (evita que quede un registro con datos falseados).
 */
export async function aprobarPublicacion(id: string): Promise<void> {
  const { error } = await supabase.from('publicaciones').update({ estado: 'aprobado' }).eq('id', id);
  if (error) throw error;
}

export async function rechazarPublicacion(id: string): Promise<void> {
  const { error } = await supabase.from('publicaciones').update({ estado: 'rechazado' }).eq('id', id);
  if (error) throw error;
}

export type HistorialItem = {
  id: string;
  accion: 'aprobado' | 'rechazado';
  created_at: string;
  publicacion: { titulo: string } | null;
  admin: { nombre: string } | null;
};

export async function fetchHistorialModeracion(): Promise<HistorialItem[]> {
  const { data, error } = await supabase
    .from('moderacion_historial')
    .select('id, accion, created_at, publicacion:publicaciones(titulo), admin:profiles!moderacion_historial_admin_id_fkey(nombre)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data as unknown as HistorialItem[]) ?? [];
}

export type MetricaPublicacion = {
  publicacion_id: string;
  titulo: string;
  total_clics_whatsapp: number;
  dias_con_actividad: number;
};

/**
 * Lee la vista `vista_metricas_publicacion` (ver migración 0001/0002) — ya
 * viene con `security_invoker`, así que solo un admin obtiene filas de
 * verdad; cualquier otro rol recibe vacío por RLS.
 */
export async function fetchMetricas(): Promise<MetricaPublicacion[]> {
  const { data, error } = await supabase
    .from('vista_metricas_publicacion')
    .select('*')
    .order('total_clics_whatsapp', { ascending: false });

  if (error) throw error;
  return (data as MetricaPublicacion[]) ?? [];
}


// ============================================================================
// Administración por comuna — categorías propias y perfiles
// ============================================================================
// El admin recorre: comuna → sus categorías → los perfiles que publican en
// esa categoría dentro de esa comuna. Ver migración 0017.

/** Una categoría vista desde una comuna concreta. */
export type CategoriaDeComuna = {
  id: string;
  nombre: string;
  icono: string | null;
  /** Se muestra en el catálogo de esta comuna. */
  visible: boolean;
  orden: number;
};

export type ConfigCategoriasComuna = {
  /** false = esta comuna todavía muestra la lista global. */
  personalizada: boolean;
  categorias: CategoriaDeComuna[];
};

/**
 * Las categorías de una comuna tal como las ve el admin: si la comuna no está
 * personalizada, se le muestra la lista global (que es lo que sus usuarios
 * están viendo) marcando que aún no es propia.
 */
export async function fetchConfigCategoriasComuna(comunaId: string): Promise<ConfigCategoriasComuna> {
  const { data: comuna, error: errorComuna } = await supabase
    .from('comunas')
    .select('categorias_personalizadas')
    .eq('id', comunaId)
    .maybeSingle();
  if (errorComuna) throw errorComuna;

  if (!comuna?.categorias_personalizadas) {
    const globales = await fetchCategoriasAdmin();
    return {
      personalizada: false,
      categorias: globales.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        icono: c.icono,
        visible: c.activa,
        orden: c.orden,
      })),
    };
  }

  const { data, error } = await supabase
    .from('categorias_comuna')
    .select('visible, orden, categoria:categorias(id, nombre, icono)')
    .eq('comuna_id', comunaId)
    .order('orden', { ascending: true });
  if (error) throw error;

  type Fila = { visible: boolean; orden: number; categoria: { id: string; nombre: string; icono: string | null } | null };
  const categorias = ((data as unknown as Fila[]) ?? [])
    .filter((fila): fila is Fila & { categoria: NonNullable<Fila['categoria']> } => fila.categoria !== null)
    .map((fila) => ({ ...fila.categoria, visible: fila.visible, orden: fila.orden }));

  return { personalizada: true, categorias };
}

/**
 * Copia la lista global a esta comuna si todavía no tiene la suya. Se llama
 * antes de cualquier cambio: hasta ese momento la comuna no tiene filas
 * propias que modificar. Es idempotente (ver 0017).
 */
export async function personalizarComuna(comunaId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_personalizar_comuna', { p_comuna: comunaId });
  if (error) throw error;
}

/** Ocultar / volver a mostrar una categoría en esta comuna. Reversible. */
export async function actualizarVisibilidadCategoriaComuna(
  comunaId: string,
  categoriaId: string,
  visible: boolean,
): Promise<void> {
  await personalizarComuna(comunaId);
  const { data, error } = await supabase
    .from('categorias_comuna')
    .update({ visible })
    .eq('comuna_id', comunaId)
    .eq('categoria_id', categoriaId)
    .select('categoria_id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo actualizar la categoría en esta comuna.');
}

/**
 * Saca la categoría de esta comuna (sigue existiendo en las demás).
 *
 * Las publicaciones de esta comuna que estaban ahí se mueven a "Otro", igual
 * que al eliminar una categoría de toda la app: si se dejaran apuntando a una
 * categoría que la comuna ya no muestra, desaparecerían del catálogo sin que
 * su dueño entienda por qué.
 */
export async function quitarCategoriaDeComuna(comunaId: string, categoriaId: string): Promise<void> {
  await personalizarComuna(comunaId);

  const otroId = await obtenerCategoriaOtro();
  if (otroId === categoriaId) {
    throw new Error(`"${CATEGORIA_OTRO}" no se puede quitar: ahí van las publicaciones de las categorías eliminadas.`);
  }

  const { error: moverError } = await supabase
    .from('publicaciones')
    .update({ categoria_id: otroId })
    .eq('comuna_id', comunaId)
    .eq('categoria_id', categoriaId);
  if (moverError) throw moverError;

  const { data, error } = await supabase
    .from('categorias_comuna')
    .delete()
    .eq('comuna_id', comunaId)
    .eq('categoria_id', categoriaId)
    .select('categoria_id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo quitar la categoría de esta comuna.');
}

/** Agrega a esta comuna una categoría que ya existe en la app. */
export async function agregarCategoriaAComuna(comunaId: string, categoriaId: string): Promise<void> {
  await personalizarComuna(comunaId);

  const { data: ultima } = await supabase
    .from('categorias_comuna')
    .select('orden')
    .eq('comuna_id', comunaId)
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from('categorias_comuna')
    .upsert(
      { comuna_id: comunaId, categoria_id: categoriaId, visible: true, orden: (ultima?.orden ?? 0) + 1 },
      { onConflict: 'comuna_id,categoria_id' },
    );
  if (error) throw error;
}

/**
 * Pone la categoría en TODAS las comunas.
 *
 * No siembra 346 filas: se enciende en la lista general —que es la que siguen
 * las comunas sin configurar— y se agrega una por una solo a las que ya tienen
 * catálogo propio, que son las únicas que no miran esa lista general.
 */
export async function agregarCategoriaATodasLasComunas(categoriaId: string): Promise<void> {
  const { error: errorGlobal } = await supabase
    .from('categorias')
    .update({ activa: true })
    .eq('id', categoriaId);
  if (errorGlobal) throw errorGlobal;

  const { data: personalizadas, error } = await supabase
    .from('comunas')
    .select('id')
    .eq('categorias_personalizadas', true);
  if (error) throw error;

  for (const comuna of personalizadas ?? []) {
    await agregarCategoriaAComuna(comuna.id as string, categoriaId);
  }
}

/**
 * Traslada la categoría de una comuna a otra: aparece en la de destino y deja
 * de estar en la de origen.
 *
 * Primero se agrega y después se quita. Al revés, si fallara el segundo paso
 * la categoría no quedaría en ninguna de las dos; así, en el peor caso queda
 * en ambas, que se arregla con un toque.
 */
export async function moverCategoriaDeComuna(
  categoriaId: string,
  comunaOrigen: string,
  comunaDestino: string,
): Promise<void> {
  if (comunaOrigen === comunaDestino) return;
  await agregarCategoriaAComuna(comunaDestino, categoriaId);
  await quitarCategoriaDeComuna(comunaOrigen, categoriaId);
}

/**
 * Crea una categoría que existe SOLO en esta comuna.
 *
 * Se crea en la lista global apagada (`activa: false`) y se enciende
 * únicamente en esta comuna: así no aparece en las comunas que todavía usan
 * la lista global, pero el admin puede agregarla a otra comuna cuando quiera
 * — la categoría existe una sola vez y las publicaciones siempre apuntan a
 * ella.
 */
export async function crearCategoriaEnComuna(
  comunaId: string,
  input: { nombre: string; icono: string | null },
): Promise<void> {
  await personalizarComuna(comunaId);

  const { data: maxOrden } = await supabase
    .from('categorias')
    .select('orden')
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: creada, error } = await supabase
    .from('categorias')
    .insert({ nombre: input.nombre, icono: input.icono, orden: (maxOrden?.orden ?? 0) + 1, activa: false })
    .select('id')
    .single();
  if (error) throw error;

  await agregarCategoriaAComuna(comunaId, creada.id as string);
}

/**
 * Crea una categoría para TODAS las comunas: nace encendida en la lista
 * general y se agrega a las comunas que ya tienen catálogo propio.
 */
export async function crearCategoriaEnTodasLasComunas(input: {
  nombre: string;
  icono: string | null;
}): Promise<void> {
  const { data: maxOrden } = await supabase
    .from('categorias')
    .select('orden')
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: creada, error } = await supabase
    .from('categorias')
    .insert({ nombre: input.nombre, icono: input.icono, orden: (maxOrden?.orden ?? 0) + 1, activa: true })
    .select('id')
    .single();
  if (error) throw error;

  await agregarCategoriaATodasLasComunas(creada.id as string);
}

/** Guarda el orden de las categorías de esta comuna (arrastrando en el panel). */
export async function guardarOrdenCategoriasComuna(comunaId: string, idsEnOrden: string[]): Promise<void> {
  await personalizarComuna(comunaId);
  const resultados = await Promise.all(
    idsEnOrden.map((categoriaId, indice) =>
      supabase
        .from('categorias_comuna')
        .update({ orden: indice + 1 })
        .eq('comuna_id', comunaId)
        .eq('categoria_id', categoriaId),
    ),
  );
  const fallo = resultados.find((r) => r.error);
  if (fallo?.error) throw fallo.error;
}

// ------------------------------ Perfiles ------------------------------------

export type PerfilEnCategoria = {
  id: string;
  nombre: string;
  logo_url: string | null;
  telefono_contacto: string | null;
  rol: string;
  /** false = oculto: no se ve él ni sus publicaciones en el catálogo. */
  activo: boolean;
  /** Cuántas publicaciones tiene en esta comuna y categoría. */
  publicaciones: number;
};

/**
 * Los perfiles que publican en esta categoría dentro de esta comuna.
 *
 * Un perfil no pertenece a una categoría: lo que tiene categoría es cada
 * publicación. Así que la lista sale de sus publicaciones (las eliminadas no
 * cuentan) y se agrupa por autor.
 */
export async function fetchPerfilesDeCategoria(comunaId: string, categoriaId: string): Promise<PerfilEnCategoria[]> {
  const { data, error } = await supabase
    .from('publicaciones')
    .select('usuario_id, autor:profiles!publicaciones_usuario_id_fkey(id, nombre, logo_url, telefono_contacto, rol, activo)')
    .eq('comuna_id', comunaId)
    .eq('categoria_id', categoriaId)
    .is('deleted_at', null);
  if (error) throw error;

  type Fila = { autor: Omit<PerfilEnCategoria, 'publicaciones'> | null };
  const porPerfil = new Map<string, PerfilEnCategoria>();
  for (const fila of (data as unknown as Fila[]) ?? []) {
    if (!fila.autor) continue;
    const existente = porPerfil.get(fila.autor.id);
    if (existente) existente.publicaciones += 1;
    else porPerfil.set(fila.autor.id, { ...fila.autor, publicaciones: 1 });
  }
  return [...porPerfil.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/**
 * Ocultar / volver a mostrar un perfil. Oculto, ni él ni sus publicaciones
 * aparecen en el catálogo (lo aplica la base, ver 0017), pero la cuenta sigue
 * intacta y se puede volver a mostrar con un toque.
 */
export async function actualizarVisibilidadPerfil(perfilId: string, activo: boolean): Promise<void> {
  const { data, error } = await supabase.from('profiles').update({ activo }).eq('id', perfilId).select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('No se pudo actualizar el perfil. Revisa que tu cuenta sea de administrador.');
  }
}

/**
 * Elimina el perfil y todo lo suyo: cuenta, publicaciones y productos. No se
 * puede deshacer — para algo temporal está "ocultar". Lo ejecuta una función
 * de la base, porque borrar la cuenta de acceso no es algo que la app pueda
 * hacer desde el teléfono (ver 0017).
 */
export async function eliminarPerfil(perfilId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_eliminar_perfil', { p_perfil: perfilId });
  if (error) throw error;
}

/** Elimina todas las publicaciones de un perfil, dejando la cuenta en pie. */
export async function eliminarPublicacionesDePerfil(perfilId: string): Promise<number> {
  const { data, error } = await supabase
    .from('publicaciones')
    .delete()
    .eq('usuario_id', perfilId)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}
