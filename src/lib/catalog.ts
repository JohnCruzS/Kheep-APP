import AsyncStorage from '@react-native-async-storage/async-storage';
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
  /** A dónde lleva tocarlo; null = no lleva a ninguna parte. */
  enlace: string | null;
  /** Modo Principal (0042): sale primero una vez por teléfono. */
  principal?: boolean;
};

/** Cuántos banners caben a la vez en una comuna (documento EDIT APP: "3/5"). */
export const CUPO_BANNERS = 5;

export type Categoria = {
  id: string;
  nombre: string;
  icono: string | null;
  orden: number;
};

export type Comuna = {
  id: string;
  nombre: string;
  /** Región a la que pertenece, tal como está en la base. */
  region?: string | null;
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
  estado?: 'pendiente' | 'aprobado' | 'rechazado';
  /** Por cuál foto la rechazaron (0039). */
  rechazo_foto?: number | null;
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
  /** Por cuál foto la rechazaron (0039). */
  rechazo_foto?: number | null;
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
/**
 * `enlace`, `vistas` y `clics` llegan con la migración 0025. Mientras no esté
 * aplicada, pedir esas columnas haría fallar la consulta entera y el catálogo
 * se quedaría SIN banners: por eso se reintenta sin ellas.
 */
function faltaColumnaNueva(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '42703' || (error?.message ?? '').includes('does not exist');
}

export async function fetchBanners(comunaId?: string | null): Promise<Banner[]> {
  // Con el modo Principal (0042); sin la migración, como antes.
  const conPrincipal = await consultarBanners('id, imagen_url, orden, enlace, principal', comunaId);
  if (!faltaColumnaNueva(conPrincipal.error)) {
    if (conPrincipal.error) throw conPrincipal.error;
    return ordenarPrincipales((conPrincipal.data ?? []) as unknown as Banner[]);
  }
  const conEnlace = await consultarBanners('id, imagen_url, orden, enlace', comunaId);
  if (!faltaColumnaNueva(conEnlace.error)) {
    if (conEnlace.error) throw conEnlace.error;
    return (conEnlace.data ?? []) as unknown as Banner[];
  }
  const basico = await consultarBanners('id, imagen_url, orden', comunaId);
  if (basico.error) throw basico.error;
  return ((basico.data ?? []) as unknown as Omit<Banner, 'enlace'>[]).map((b) => ({ ...b, enlace: null }));
}

const CLAVE_PRINCIPALES = 'kheep.principalesVistos';
/** Los principales que en ESTA apertura de la app van primero. */
const principalesDeLaSesion = new Set<string>();

/**
 * Modo Principal (pedido del cliente): un banner principal sale primero en
 * el carrusel UNA sola vez por teléfono — durante la primera apertura de la
 * app en que aparece. El teléfono recuerda cuáles ya mostró primero; la
 * próxima vez que se abra la app, quedan en el orden normal con los demás.
 * Mientras la app siga abierta, siguen primero (volver a Inicio no los
 * desordena).
 */
async function ordenarPrincipales(banners: Banner[]): Promise<Banner[]> {
  const principales = banners.filter((b) => b.principal);
  if (principales.length === 0) return banners;

  let vistos: string[] = [];
  try {
    vistos = JSON.parse((await AsyncStorage.getItem(CLAVE_PRINCIPALES)) ?? '[]');
  } catch {
    vistos = [];
  }
  const nuevos = principales.filter((b) => !vistos.includes(b.id));
  for (const b of nuevos) principalesDeLaSesion.add(b.id);
  if (nuevos.length > 0) {
    // Se recuerdan los últimos 300: de sobra para los banners vigentes.
    const guardar = [...vistos, ...nuevos.map((b) => b.id)].slice(-300);
    AsyncStorage.setItem(CLAVE_PRINCIPALES, JSON.stringify(guardar)).catch(() => {});
  }

  const primero = banners.filter((b) => principalesDeLaSesion.has(b.id));
  if (primero.length === 0) return banners;
  return [...primero, ...banners.filter((b) => !principalesDeLaSesion.has(b.id))];
}

async function consultarBanners(columnas: string, comunaId?: string | null) {
  const ahora = new Date().toISOString();
  let request = supabase
    .from('banners')
    .select(columnas)
    .eq('activo', true)
    .eq('pagado', true)
    .or(`fecha_inicio.is.null,fecha_inicio.lte.${ahora}`)
    .or(`fecha_fin.is.null,fecha_fin.gte.${ahora}`)
    .order('orden', { ascending: true })
    // El mismo desempate que en el panel: siempre en el mismo orden.
    .order('fecha_inicio', { ascending: true, nullsFirst: true })
    .order('id', { ascending: true });

  if (comunaId) {
    request = request.or(`comuna_id.is.null,comuna_id.eq.${comunaId}`);
  }

  return request;
}

/**
 * Solo la comuna en la que está parado el catálogo.
 *
 * Al abrir la app lo único que hace falta es su nombre, para el encabezado.
 * Pedir de una las ~350 comunas del selector tardaba medio segundo largo y
 * retrasaba TODO el arranque; la lista completa se pide aparte, en segundo
 * plano, y está lista mucho antes de que alguien toque el selector.
 */
export async function fetchComuna(id: string): Promise<Comuna | null> {
  const { data, error } = await supabase.from('comunas').select('id, nombre, region').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Comuna | null) ?? null;
}

export async function fetchComunas(): Promise<Comuna[]> {
  const { data, error } = await supabase
    .from('comunas')
    .select('id, nombre, region')
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
 * La categoría "Otro" tal como está, sin crearla ni tocarla (eso lo hace el
 * panel con `obtenerCategoriaOtro`). El catálogo la usa para las
 * publicaciones que quedaron sin una categoría visible: sin "Todas", ahí es
 * donde se pueden encontrar.
 */
export async function fetchCategoriaOtro(): Promise<Categoria | null> {
  const { data, error } = await supabase
    .from('categorias')
    .select('id, nombre, icono, orden')
    .eq('activa', true)
    .ilike('nombre', CATEGORIA_OTRO)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Categoria | null) ?? null;
}

/**
 * Las categorías que hoy tienen al menos un comercio visible en esa comuna.
 *
 * El inicio solo muestra esas: una categoría vacía manda a un catálogo sin
 * nada y parece que la app falla. Siguen existiendo para el admin, que las
 * ve y las administra en la lista de la comuna.
 */
export async function fetchCategoriasConContenido(comunaId?: string | null): Promise<Set<string>> {
  let request = supabase
    .from('publicaciones')
    .select('categoria_id')
    .eq('estado', 'aprobado')
    .is('deleted_at', null);
  if (comunaId) request = request.eq('comuna_id', comunaId);

  const { data, error } = await request;
  if (error) throw error;
  return new Set(((data ?? []) as { categoria_id: string | null }[]).map((p) => p.categoria_id ?? '').filter(Boolean));
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
  /**
   * Las categorías que esa comuna muestra. Sin esto, una publicación de una
   * categoría que el admin ocultó seguía apareciendo en el catálogo aunque su
   * categoría no estuviera en la fila de arriba: se veía un comercio suelto,
   * imposible de filtrar.
   */
  categoriasVisibles?: string[] | null;
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
  categoriasVisibles,
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
  } else if (categoriasVisibles) {
    // Sin ninguna categoría visible no hay nada que mostrar; `in` con lista
    // vacía no filtra, así que se corta acá.
    if (categoriasVisibles.length === 0) return [];
    request = request.in('categoria_id', categoriasVisibles);
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

/** Lo mínimo de una publicación para ordenar y filtrar el catálogo sin bajarla entera. */
export type FilaIndiceCatalogo = Pick<PublicacionResumen, 'id' | 'categoria_id' | 'destacado'>;

/**
 * El catálogo se carga en dos pasos, para no bajar de una vez todas las
 * publicaciones de una comuna con sus productos y fotos:
 *
 *  1. Este índice: solo id, categoría y si está destacada, de TODAS las de la
 *     comuna. Pesa muy poco aunque sean cientos, y alcanza para armar el
 *     orden al azar, saber qué categorías tienen algo y cambiar de categoría
 *     al instante.
 *  2. `fetchPublicacionesPorIds`: los datos completos (productos incluidos),
 *     de a poco, a medida que la persona baja por la lista.
 *
 * Mismos filtros que `fetchPublicaciones`: aprobadas, no eliminadas y de la
 * comuna.
 */
export async function fetchIndiceCatalogo(comunaId: string | null): Promise<FilaIndiceCatalogo[]> {
  let request = supabase
    .from('publicaciones')
    .select('id, categoria_id, destacado')
    .eq('estado', 'aprobado')
    .is('deleted_at', null)
    .order('destacado', { ascending: false })
    .order('orden_peso', { ascending: false });
  if (comunaId) request = request.eq('comuna_id', comunaId);

  const { data, error } = await request;
  if (error) throw error;
  return (data as FilaIndiceCatalogo[]) ?? [];
}

/** Los datos completos de un grupo de publicaciones del catálogo (ver `fetchIndiceCatalogo`). */
export async function fetchPublicacionesPorIds(ids: string[]): Promise<PublicacionResumen[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('publicaciones')
    .select(
      'id, titulo, descripcion, logo_url, telefono, destacado, categoria_id, categoria:categorias(nombre, icono), comuna:comunas(nombre), productos(nombre, precio, imagen_url, orden)',
    )
    .in('id', ids)
    .eq('estado', 'aprobado')
    .is('deleted_at', null);
  if (error) throw error;
  return (data as unknown as PublicacionResumen[]) ?? [];
}

export async function fetchPublicacionDetalle(id: string): Promise<PublicacionDetalle | null> {
  const base =
    'id, titulo, descripcion, logo_url, telefono, destacado, estado, categoria_id, categoria:categorias(nombre), comuna:comunas(nombre), productos(id, nombre, descripcion, precio, imagen_url, orden)';
  const consultar = (columnas: string) =>
    supabase
      .from('publicaciones')
      .select(columnas)
      .eq('id', id)
      .order('orden', { referencedTable: 'productos', ascending: true })
      .maybeSingle();
  // `rechazo_foto` llega con la 0039: sin ella se pide lo demás.
  let respuesta = await consultar(`${base}, rechazo_foto`);
  if (respuesta.error?.code === '42703') respuesta = await consultar(base);
  const { data, error } = respuesta;

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
  /**
   * A dónde escriben los interesados. Si no viene, se usa el del perfil: un
   * comercio puede atender en otro número sin cambiar el de la cuenta.
   */
  telefono?: string | null;
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
  const telefono = input.telefono?.trim() || perfil?.telefono_contacto;
  if (!telefono) {
    throw new Error('Escribe el teléfono al que quieres que te escriban.');
  }

  const { data: publicacion, error } = await supabase
    .from('publicaciones')
    .insert({
      usuario_id: auth.user.id,
      titulo: input.titulo,
      telefono,
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

  const base = 'id, titulo, logo_url, estado, destacado, categoria:categorias(nombre), comuna:comunas(nombre), productos(id)';
  const consultar = (columnas: string) =>
    supabase
      .from('publicaciones')
      .select(columnas)
      .eq('usuario_id', auth.user!.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
  // `rechazo_foto` llega con la 0039: sin ella se pide lo demás.
  let respuesta = await consultar(`${base}, rechazo_foto`);
  if (respuesta.error?.code === '42703') respuesta = await consultar(base);
  const { data, error } = respuesta;

  if (error) throw error;
  return (data as unknown as MiPublicacion[]) ?? [];
}

type EditarPublicacion = {
  titulo: string;
  categoriaId: string | null;
  comunaId: string | null;
  logoUrl: string | null;
  /** A dónde escriben los interesados; si no viene, no se cambia. */
  telefono?: string;
  /**
   * Devolverla a revisión (0036): al reenviar una rechazada, o al editar una
   * aprobada de alguien sin "Directo". El dueño solo puede pasarla a
   * "pendiente", nunca aprobarse a sí mismo.
   */
  aRevision?: boolean;
};

/**
 * Edita el contenido de una publicación propia. Nunca manda `estado` — la
 * política RLS "el dueño edita contenido, no el estado" lo rechazaría igual,
 * pero ni siquiera se intenta desde acá. Tampoco manda `telefono`: siempre
 * es el del perfil del dueño (ver migración 0014).
 */
export async function actualizarPublicacion(id: string, input: EditarPublicacion): Promise<void> {
  const { data, error } = await supabase
    .from('publicaciones')
    .update({
      titulo: input.titulo,
      categoria_id: input.categoriaId,
      comuna_id: input.comunaId,
      logo_url: input.logoUrl,
      ...(input.telefono ? { telefono: input.telefono } : {}),
      ...(input.aRevision ? { estado: 'pendiente' } : {}),
    })
    .eq('id', id)
    .select('id');

  if (error) {
    // Sin la migración 0036 la base no deja al dueño cambiar el estado.
    if (input.aRevision && (error.code === '42501' || /row-level security/i.test(error.message ?? ''))) {
      throw new Error('Falta ejecutar la migración 0036 en Supabase para reenviar publicaciones a revisión.');
    }
    throw error;
  }
  // Con el permiso "Editar" apagado la base no rechaza: simplemente no cambia
  // nada. Sin esta comprobación la app diría "guardado" sin haber guardado.
  if (!data || data.length === 0) throw new Error(SIN_PERMISO_EDITAR);
}

/** Lo que se le dice a quien tiene el permiso "Editar" apagado (0033). */
export const SIN_PERMISO_EDITAR = 'Un administrador desactivó la edición de tus publicaciones. Escríbele para que la vuelva a activar.';

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
): Promise<string> {
  const { data, error } = await supabase
    .from('productos')
    .insert({ publicacion_id: publicacionId, ...input })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function actualizarProducto(
  id: string,
  input: { nombre: string; precio: number; imagen_url: string | null },
): Promise<void> {
  const { data, error } = await supabase.from('productos').update(input).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(SIN_PERMISO_EDITAR);
}

export async function eliminarProducto(id: string): Promise<void> {
  const { data, error } = await supabase.from('productos').delete().eq('id', id).select('id, imagen_url');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(SIN_PERMISO_EDITAR);
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

  // El nombre de sus publicaciones es el de su perfil: si cambió, se cambia
  // también en ellas (igual que el teléfono, que lo hace la base).
  const nombre = input.nombre.trim();
  if (nombre) {
    const { error: errorPublicaciones } = await supabase
      .from('publicaciones')
      .update({ titulo: nombre })
      .eq('usuario_id', auth.user.id)
      .is('deleted_at', null)
      .neq('titulo', nombre);
    if (errorPublicaciones) throw errorPublicaciones;
  }
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
  /** Quién lo subió: solo sus propios banners se pueden cambiar de comunas. */
  usuario_id: string;
  comuna_id: string | null;
  imagen_url: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  pagado: boolean;
  enlace: string | null;
  vistas: number;
  clics: number;
  /** Personas distintas que lo vieron (0040). */
  vistas_unicas: number;
  /** false = no sale en el carrusel (por ejemplo, en pausa). */
  activo: boolean;
  /** Desde cuándo está en pausa (0041); null = no pausado. */
  pausado_en: string | null;
  /** Lo contratado: en días (los comerciantes) o en horas (0042, el admin). */
  dias: number | null;
  horas: number | null;
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
  const base = 'id, usuario_id, comuna_id, imagen_url, fecha_inicio, fecha_fin, pagado, activo, ';
  const relaciones = 'autor:profiles!banners_usuario_id_fkey(nombre), comuna:comunas(nombre)';

  // Los publicados y vigentes, también los pausados: uno en pausa sigue acá
  // (para reanudarlo) aunque su fecha de término ya haya pasado, porque al
  // reanudar se corre lo que duró la pausa.
  const consultar = (columnas: string, conPausa: boolean) =>
    supabase
      .from('banners')
      .select(columnas)
      .eq('pagado', true)
      .or(`fecha_inicio.is.null,fecha_inicio.lte.${ahora}`)
      .or(`fecha_fin.is.null,fecha_fin.gte.${ahora}${conPausa ? ',pausado_en.not.is.null' : ''}`)
      .order('orden', { ascending: true })
      // Desempate fijo: con el mismo `orden`, la base los devolvía en
      // cualquier orden y al pausar uno cambiaba de lugar.
      .order('fecha_inicio', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true });

  // Sin las migraciones 0042 / 0041 / 0040 / 0025 se muestra la lista sin
  // esos datos, en vez de un error.
  const conHoras = await consultar(`${base}dias, horas, enlace, vistas, clics, vistas_unicas, pausado_en, ${relaciones}`, true);
  if (!faltaColumnaNueva(conHoras.error)) {
    if (conHoras.error) throw conHoras.error;
    return (conHoras.data as unknown as BannerAdmin[]) ?? [];
  }

  const sinDuracion = { dias: null, horas: null };
  const conPausa = await consultar(`${base}enlace, vistas, clics, vistas_unicas, pausado_en, ${relaciones}`, true);
  if (!faltaColumnaNueva(conPausa.error)) {
    if (conPausa.error) throw conPausa.error;
    return ((conPausa.data ?? []) as unknown as Omit<BannerAdmin, 'dias' | 'horas'>[]).map((b) => ({ ...b, ...sinDuracion }));
  }

  const conUnicas = await consultar(`${base}enlace, vistas, clics, vistas_unicas, ${relaciones}`, false);
  if (!faltaColumnaNueva(conUnicas.error)) {
    if (conUnicas.error) throw conUnicas.error;
    return ((conUnicas.data ?? []) as unknown as Omit<BannerAdmin, 'pausado_en' | 'dias' | 'horas'>[]).map((b) => ({
      ...b,
      pausado_en: null,
      ...sinDuracion,
    }));
  }

  const completo = await consultar(`${base}enlace, vistas, clics, ${relaciones}`, false);
  if (!faltaColumnaNueva(completo.error)) {
    if (completo.error) throw completo.error;
    return ((completo.data ?? []) as unknown as Omit<BannerAdmin, 'vistas_unicas' | 'pausado_en' | 'dias' | 'horas'>[]).map(
      (b) => ({
        ...b,
        vistas_unicas: 0,
        pausado_en: null,
        ...sinDuracion,
      }),
    );
  }

  const simple = await consultar(base + relaciones, false);
  if (simple.error) throw simple.error;
  return (
    (simple.data ?? []) as unknown as Omit<
      BannerAdmin,
      'enlace' | 'vistas' | 'clics' | 'vistas_unicas' | 'pausado_en' | 'dias' | 'horas'
    >[]
  ).map((b) => ({
    ...b,
    enlace: null,
    vistas: 0,
    clics: 0,
    vistas_unicas: 0,
    pausado_en: null,
    ...sinDuracion,
  }));
}

/**
 * Pausa o reanuda un banner (0041). En pausa no se muestra y su tiempo se
 * congela; al reanudar sigue con lo que le quedaba. Lo hace la base, con su
 * propia hora.
 */
export async function pausarBanner(id: string, pausar: boolean): Promise<void> {
  const { error } = await supabase.rpc(pausar ? 'pausar_banner' : 'reanudar_banner', { p_banner: id });
  if (error) {
    if (error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? '')) {
      throw new Error('Falta ejecutar la migración 0041 en Supabase para pausar banners.');
    }
    throw error;
  }
}

/**
 * Suma una vista o un clic del banner. Se hace en la base (0025) porque el
 * catálogo lo ve gente sin cuenta: nadie puede escribir el número a mano,
 * solo pedir que suba de a uno.
 *
 * Los dos fallan en silencio a propósito: una métrica perdida no vale
 * interrumpirle nada al usuario.
 */
export async function registrarVistaBanner(bannerId: string): Promise<void> {
  // Con quién lo ve (0040), para contar personas distintas además de vistas.
  const visitante = await idDeVisitante();
  const { error } = await supabase.rpc('registrar_vista_banner', { p_banner: bannerId, p_visitante: visitante });
  // Sin la migración 0040 la función no recibe al visitante: se cuenta la vista igual.
  if (error) await supabase.rpc('registrar_vista_banner', { p_banner: bannerId });
}

const CLAVE_VISITANTE = 'kheep.visitante';
let visitanteEnMemoria: string | null = null;

/**
 * Un identificador al azar de este teléfono, guardado en el propio teléfono
 * (no es un dato personal): sirve para contar a cada persona una sola vez
 * entre las vistas de un banner, tenga o no cuenta.
 */
async function idDeVisitante(): Promise<string> {
  if (visitanteEnMemoria) return visitanteEnMemoria;
  try {
    const guardado = await AsyncStorage.getItem(CLAVE_VISITANTE);
    if (guardado) return (visitanteEnMemoria = guardado);
  } catch {
    // Sin almacenamiento se usa uno para esta sesión.
  }
  const nuevo = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 8)}`;
  visitanteEnMemoria = nuevo;
  AsyncStorage.setItem(CLAVE_VISITANTE, nuevo).catch(() => {});
  return nuevo;
}

export async function registrarClicBanner(bannerId: string): Promise<void> {
  await supabase.rpc('registrar_clic_banner', { p_banner: bannerId });
}

/** Cuántos banners vigentes hay en una comuna; con CUPO_BANNERS da el "3/5". */
export async function contarBannersVigentes(comunaId: string | null): Promise<number> {
  const { data, error } = await supabase.rpc('banners_vigentes_en_comuna', { p_comuna: comunaId });
  if (error) throw error;
  return Number(data ?? 0);
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

/** Cuántas filas se piden por vuelta al listar referencias. */
const PAGINA_REFERENCIAS = 1000;

/**
 * Todas las URL de una columna, en tandas.
 *
 * Es imprescindible que estén TODAS: la limpieza borra lo que no aparece acá,
 * así que una respuesta recortada (el servidor devuelve como mucho 1000 filas
 * por consulta) haría desaparecer imágenes en pleno uso apenas la tabla pase
 * de ese tamaño. Ante cualquier error se corta con una excepción, nunca con
 * una lista a medias.
 */
async function leerColumnaCompleta(tabla: string, columna: string): Promise<(string | null)[]> {
  const urls: (string | null)[] = [];
  for (let desde = 0; ; desde += PAGINA_REFERENCIAS) {
    const { data, error } = await supabase
      .from(tabla)
      .select(columna)
      .range(desde, desde + PAGINA_REFERENCIAS - 1);
    if (error) throw error;
    const filas = (data as unknown as Record<string, string | null>[] | null) ?? [];
    for (const fila of filas) urls.push(fila[columna] ?? null);
    if (filas.length < PAGINA_REFERENCIAS) return urls;
  }
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
    leerColumnaCompleta('profiles', 'logo_url'),
    leerColumnaCompleta('publicaciones', 'logo_url'),
    leerColumnaCompleta('productos', 'imagen_url'),
    leerColumnaCompleta('banners', 'imagen_url'),
    leerColumnaCompleta('logos_tematicos', 'imagen_url'),
  ]);

  const enUso = new Set<string>();
  for (const urls of referencias) {
    for (const url of urls) {
      const archivo = archivoDeUrl(url);
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
    const { data, error } = await supabase.storage.from(bucket).remove(rutas);
    if (error) throw error;
    // Solo lo que de verdad se borró: sin permiso, el almacenamiento no da
    // error, simplemente no borra (ver 0049).
    borradas += data?.length ?? 0;
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
  // Un banner publicado en varias comunas son varias copias con la misma
  // imagen: el archivo se borra solo si ya no lo usa ninguna otra.
  const url = data[0].imagen_url as string | null;
  const { count } = await supabase.from('banners').select('id', { count: 'exact', head: true }).eq('imagen_url', url ?? '');
  if (!count) await borrarImagenDeStorage('banners', url);
}

/**
 * Cambia el enlace de un banner. Uno publicado en varias comunas son varias
 * copias con la misma imagen: se cambia en todas. Vacío = sin enlace.
 */
export async function cambiarEnlaceBanner(imagenUrl: string, enlace: string): Promise<void> {
  const limpio = enlace.trim();
  const { error } = await supabase
    .from('banners')
    .update({ enlace: limpio ? limpio : null })
    .eq('imagen_url', imagenUrl);
  if (error) throw error;
}

/**
 * Cambia en qué comunas está un banner propio (null = todas las comunas). Las
 * copias de las comunas que se quitan se borran (la imagen no, la siguen
 * usando las demás) y las nuevas se crean iguales a la original: mismo
 * enlace, modo, inicio y término, y la misma pausa si está pausado.
 */
export async function cambiarUbicacionBanner(bannerId: string, comunaIds: (string | null)[]): Promise<void> {
  if (comunaIds.length === 0) throw new Error('Elige al menos una comuna.');
  const { data: original, error: e1 } = await supabase.from('banners').select('*').eq('id', bannerId).single();
  if (e1) throw e1;
  const { data: copias, error: e2 } = await supabase
    .from('banners')
    .select('id, comuna_id')
    .eq('imagen_url', original.imagen_url)
    .eq('usuario_id', original.usuario_id);
  if (e2) throw e2;

  const destino = new Set(comunaIds);
  const actuales = new Set((copias ?? []).map((c) => c.comuna_id as string | null));
  const sobran = (copias ?? []).filter((c) => !destino.has(c.comuna_id as string | null)).map((c) => c.id as string);
  const faltan = comunaIds.filter((id) => !actuales.has(id));

  // Primero las nuevas: si algo falla, el banner no queda sin comunas.
  if (faltan.length > 0) {
    const { data: nuevas, error: e3 } = await supabase
      .from('banners')
      .insert(
        faltan.map((comunaId) => ({
          usuario_id: original.usuario_id,
          imagen_url: original.imagen_url,
          comuna_id: comunaId,
          dias: original.dias,
          horas: original.horas ?? null,
          orden: original.orden,
          enlace: original.enlace,
          pagado: original.pagado,
          principal: original.principal ?? false,
          fecha_inicio: original.fecha_inicio,
        })),
      )
      .select('id');
    if (e3) throw e3;
    // El término y la pausa, exactos como la original (al crearlas, la base
    // calcula el término desde el inicio y no sabe de pausas).
    const ids = (nuevas ?? []).map((n) => n.id as string);
    if (ids.length > 0) {
      const { error: e4 } = await supabase
        .from('banners')
        .update({ fecha_fin: original.fecha_fin, pausado_en: original.pausado_en ?? null, activo: original.activo })
        .in('id', ids);
      if (e4) throw e4;
    }
  }

  if (sobran.length > 0) {
    const { error: e5 } = await supabase.from('banners').delete().in('id', sobran);
    if (e5) throw e5;
  }
}

/** Precio base por día de un banner donde no se puso otro (pedido del cliente: todos parten en $25.000). */
export const PRECIO_BANNER_POR_DIA = 25000;

export type MiBanner = {
  id: string;
  imagen_url: string;
  comuna_id: string | null;
  comuna: { nombre: string } | null;
  dias: number | null;
  pagado: boolean;
  activo: boolean;
  fecha_fin: string | null;
  /** Revisión (0037): pendiente, aprobado o rechazado. */
  estado: 'pendiente' | 'aprobado' | 'rechazado';
};

/**
 * Los banners del comerciante. `conRevision` dice si la base ya tiene la
 * revisión de banners (migración 0037): sin ella se sigue como antes (se paga
 * y se activa al tiro).
 */
export async function fetchMisBanners(): Promise<{ banners: MiBanner[]; conRevision: boolean }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { banners: [], conRevision: false };

  const base = 'id, imagen_url, comuna_id, comuna:comunas(nombre), dias, pagado, activo, fecha_fin';
  const consultar = (columnas: string) =>
    supabase.from('banners').select(columnas).eq('usuario_id', auth.user!.id).order('created_at', { ascending: false });

  const conEstado = await consultar(`${base}, estado`);
  if (conEstado.error?.code === '42703') {
    const sinEstado = await consultar(base);
    if (sinEstado.error) throw sinEstado.error;
    const filas = (sinEstado.data as unknown as Omit<MiBanner, 'estado'>[]) ?? [];
    return { banners: filas.map((b) => ({ ...b, estado: 'aprobado' as const })), conRevision: false };
  }
  if (conEstado.error) throw conEstado.error;
  return { banners: (conEstado.data as unknown as MiBanner[]) ?? [], conRevision: true };
}

/** Un banner esperando revisión, para Aprobar. */
export type BannerEnRevision = {
  id: string;
  imagen_url: string;
  usuario_id: string;
  dias: number | null;
  enlace: string | null;
  created_at: string;
  comuna: { nombre: string } | null;
  autor: { nombre: string } | null;
};

/**
 * Los banners pendientes de revisión, del que más espera al más reciente (la
 * base decide cuáles ve cada admin). Se pueden pedir solo los de una comuna
 * o los de un perfil.
 */
export async function fetchBannersPendientes(filtro?: { comunaId?: string; usuarioId?: string }): Promise<BannerEnRevision[]> {
  let request = supabase
    .from('banners')
    .select(
      'id, imagen_url, usuario_id, dias, enlace, created_at, comuna:comunas(nombre), autor:profiles!banners_usuario_id_fkey(nombre)',
    )
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true });
  if (filtro?.comunaId) request = request.eq('comuna_id', filtro.comunaId);
  if (filtro?.usuarioId) request = request.eq('usuario_id', filtro.usuarioId);
  const { data, error } = await request;
  // Sin la migración 0037 no hay revisión de banners: no hay pendientes.
  if (error?.code === '42703') return [];
  if (error) throw error;
  return (data as unknown as BannerEnRevision[]) ?? [];
}

async function cambiarEstadoBanner(id: string, estado: 'aprobado' | 'rechazado'): Promise<void> {
  // Mientras el cobro no esté conectado (pedido del cliente), aprobar también
  // lo da por pagado: así se activa al tiro por sus días (ver
  // fn_banner_activar_pago en la 0037). Cuando haya pago real, se quita
  // `pagado` de acá y el comerciante paga después de la aprobación.
  const cambio = estado === 'aprobado' ? { estado, pagado: true } : { estado };
  const { data, error } = await supabase.from('banners').update(cambio).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo cambiar el banner. Revisa que tengas permiso en su comuna.');
}

export const aprobarBanner = (id: string) => cambiarEstadoBanner(id, 'aprobado');
export const rechazarBanner = (id: string) => cambiarEstadoBanner(id, 'rechazado');

/** El comerciante cambia la imagen de un banner rechazado y lo manda de nuevo a revisión. */
export async function reenviarBanner(id: string, imagenUrl: string): Promise<void> {
  const { data, error } = await supabase
    .from('banners')
    .update({ imagen_url: imagenUrl, estado: 'pendiente' })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo reenviar el banner.');
}

export async function crearBanner(input: {
  imagenUrl: string;
  comunaId: string | null;
  dias: number;
  /** A dónde lleva tocar el banner. Opcional. */
  enlace?: string | null;
  /**
   * Los banners del admin van primero en el carrusel: son los de la casa
   * (campañas, avisos) y no compiten con los que paga un comerciante.
   */
  prioritario?: boolean;
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
      // `orden` ordena el carrusel de menor a mayor.
      orden: input.prioritario ? -100 : 0,
      enlace: input.enlace?.trim() ? input.enlace.trim() : null,
      pagado: input.pagado ?? false,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
}

/**
 * El mismo banner en varias comunas (documento EDIT APP: se eligen regiones y
 * comunas con interruptores). Cada comuna lleva su propia fila, con su cupo,
 * su duración y sus métricas; `null` es "todas las comunas" y solo lo usa el
 * administrador general. Se insertan todas de una vez: o quedan todas o
 * ninguna.
 */
export async function crearBanners(input: {
  imagenUrl: string;
  comunaIds: (string | null)[];
  dias: number;
  enlace?: string | null;
  prioritario?: boolean;
  pagado?: boolean;
  /** Solo admins (0042): sale primero una vez por teléfono. */
  principal?: boolean;
  /** Duración en horas (0042); si viene, manda sobre `dias`. */
  horas?: number | null;
}): Promise<string[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Debes iniciar sesión.');
  const enlace = input.enlace?.trim() ? input.enlace.trim() : null;

  const { data, error } = await supabase
    .from('banners')
    .insert(
      input.comunaIds.map((comunaId) => ({
        usuario_id: auth.user!.id,
        imagen_url: input.imagenUrl,
        comuna_id: comunaId,
        dias: input.dias,
        orden: input.prioritario ? -100 : 0,
        enlace,
        pagado: input.pagado ?? false,
        ...(input.principal ? { principal: true } : {}),
        ...(input.horas ? { horas: input.horas } : {}),
      })),
    )
    .select('id');

  if (error) {
    if ((input.principal || input.horas) && (faltaColumnaNueva(error) || error.code === 'PGRST204')) {
      throw new Error('Falta ejecutar la migración 0042 en Supabase para el modo Principal y las horas.');
    }
    throw error;
  }
  return (data ?? []).map((fila) => fila.id as string);
}

/**
 * Paso de pago SIMULADO — ver nota arriba. Marca `pagado=true`; el trigger
 * `fn_banner_activar_pago` calcula fecha_inicio/fecha_fin y activa el
 * banner (para un admin, `crearBanner` ya lo deja activo directamente y
 * este paso ni se llama).
 */
export async function pagarBanner(id: string): Promise<void> {
  const { error } = await supabase.from('banners').update({ pagado: true }).eq('id', id);
  if (error) {
    if (/aprobado antes de pagarlo/i.test(error.message ?? '')) {
      throw new Error('Tu banner todavía está en revisión: lo puedes pagar cuando lo aprueben.');
    }
    throw error;
  }
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

/**
 * Rechaza una publicación. `foto` (1, 2, 3…) es por cuál foto fue, para que el
 * comerciante sepa qué cambiar (0039; sin la migración se rechaza igual, sin
 * guardar el número).
 */
export async function rechazarPublicacion(id: string, foto?: number): Promise<void> {
  if (foto) {
    const { error } = await supabase
      .from('publicaciones')
      .update({ estado: 'rechazado', rechazo_foto: foto })
      .eq('id', id);
    if (!error) return;
    if (error.code !== '42703' && error.code !== 'PGRST204') throw error;
  }
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
  /** Llega con la migración 0027; sirve para filtrar por zona. */
  comuna_id?: string | null;
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
  /** Cuántas de esas esperan aprobación. */
  pendientes: number;
  /** Fotos de productos por revisar en esas pendientes: el "(7)" de la lista. */
  fotosPorRevisar: number;
  /** Desde cuándo espera su pendiente más antigua (para la lista "Publicación"). */
  pendienteDesde: string | null;
  /** El propio comerciante pausó su perfil (0038). Distinto de `activo`, que es del admin. */
  pausado: boolean;
  /** Cuándo se registró la cuenta (para ordenar de más antiguo a más reciente). */
  created_at: string;
  /** 2 = publica directo, sin pasar por Aprobar. */
  nivel: number;
  /** Suspendida = no puede entrar a su cuenta. */
  suspendida: boolean;
  /** Si puede cambiar sus publicaciones (0033; sin la migración, siempre true). */
  puede_editar: boolean;
};

/**
 * Los perfiles que publican en esta categoría dentro de esta comuna.
 *
 * Un perfil no pertenece a una categoría: lo que tiene categoría es cada
 * publicación. Así que la lista sale de sus publicaciones (las eliminadas no
 * cuentan) y se agrupa por autor.
 */
export async function fetchPerfilesDeCategoria(comunaId: string, categoriaId: string): Promise<PerfilEnCategoria[]> {
  const base = 'id, nombre, logo_url, telefono_contacto, rol, activo, created_at, nivel, suspendida';
  const consultar = (columnasAutor: string) =>
    supabase
      .from('publicaciones')
      .select(`estado, created_at, productos(count), autor:profiles!publicaciones_usuario_id_fkey(${columnasAutor})`)
      .eq('comuna_id', comunaId)
      .eq('categoria_id', categoriaId)
      .is('deleted_at', null);
  // `pausado` llega con la 0038 y `puede_editar` con la 0033: sin ellas se
  // pide lo demás.
  let respuesta = await consultar(`${base}, puede_editar, pausado`);
  if (respuesta.error?.code === '42703') respuesta = await consultar(`${base}, puede_editar`);
  if (respuesta.error?.code === '42703') respuesta = await consultar(base);
  const { data, error } = respuesta;
  if (error) throw error;

  type Fila = {
    estado: string;
    created_at: string;
    productos: { count: number }[] | null;
    autor: Omit<PerfilEnCategoria, 'publicaciones' | 'pendientes' | 'fotosPorRevisar' | 'pendienteDesde'> | null;
  };
  const porPerfil = new Map<string, PerfilEnCategoria>();
  for (const fila of (data as unknown as Fila[]) ?? []) {
    if (!fila.autor) continue;
    const pendiente = fila.estado === 'pendiente' ? 1 : 0;
    const fotos = pendiente ? (fila.productos?.[0]?.count ?? 0) : 0;
    const existente = porPerfil.get(fila.autor.id);
    if (existente) {
      existente.publicaciones += 1;
      existente.pendientes += pendiente;
      existente.fotosPorRevisar += fotos;
      if (pendiente && (!existente.pendienteDesde || fila.created_at < existente.pendienteDesde)) {
        existente.pendienteDesde = fila.created_at;
      }
    } else {
      porPerfil.set(fila.autor.id, {
        ...fila.autor,
        nivel: fila.autor.nivel ?? 1,
        suspendida: Boolean(fila.autor.suspendida),
        puede_editar: fila.autor.puede_editar ?? true,
        pausado: Boolean(fila.autor.pausado),
        publicaciones: 1,
        pendientes: pendiente,
        fotosPorRevisar: fotos,
        pendienteDesde: pendiente ? fila.created_at : null,
      });
    }
  }
  return [...porPerfil.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Cambia el nombre de una cuenta desde el panel (por ejemplo, el de un administrador). */
export async function actualizarNombrePerfil(perfilId: string, nombre: string): Promise<void> {
  const limpio = nombre.trim();
  if (!limpio) throw new Error('Escribe un nombre.');
  const { data, error } = await supabase.from('profiles').update({ nombre: limpio }).eq('id', perfilId).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo cambiar el nombre. Revisa que tu cuenta sea de administrador.');
}

/**
 * Ocultar / volver a mostrar un perfil (el interruptor del admin). Oculto, ni
 * él ni sus publicaciones aparecen en el catálogo (lo aplica la base, ver
 * 0017), pero la cuenta sigue intacta y se puede volver a mostrar con un
 * toque. El comerciante no puede deshacerlo (0038).
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

// ----------------------------------------------------------------------------
// Ficha de usuario (admin)
// ----------------------------------------------------------------------------

export type FichaUsuario = {
  id: string;
  nombre: string;
  logo_url: string | null;
  telefono_contacto: string | null;
  rol: string;
  /** 1 = sus publicaciones pasan por aprobación; 2 = publica directo. */
  nivel: 1 | 2;
  activo: boolean;
  /** Suspensión (0029). Pasada `suspendidaHasta`, la cuenta vuelve sola. */
  suspendida: boolean;
  suspensionMotivo: string | null;
  suspendidaHasta: string | null;
  /**
   * Viven en `auth.users`, fuera del alcance de la API; llegan por la función
   * `admin_datos_de_cuenta` (0024). Nulos si esa migración falta.
   */
  email: string | null;
  creado: string | null;
  ultimoAcceso: string | null;
};

export async function fetchFichaUsuario(perfilId: string): Promise<FichaUsuario | null> {
  const base = 'id, nombre, logo_url, telefono_contacto, rol, nivel, activo';
  const leerPerfil = (columnas: string) =>
    supabase.from('profiles').select(columnas).eq('id', perfilId).maybeSingle();

  const [conSuspension, cuenta] = await Promise.all([
    leerPerfil(`${base}, suspendida, suspension_motivo, suspendida_hasta`),
    supabase.rpc('admin_datos_de_cuenta', { p_perfil: perfilId }),
  ]);
  // Sin la migración 0029 no existen las columnas de suspensión: se lee lo
  // demás y la cuenta figura como no suspendida.
  const perfil = conSuspension.error?.code === '42703' ? await leerPerfil(base) : conSuspension;
  if (perfil.error) throw perfil.error;
  if (!perfil.data) return null;
  const fila = perfil.data as unknown as Record<string, unknown>;

  // Sin la migración 0024 la ficha se muestra igual, solo sin el correo.
  const datosCuenta = (Array.isArray(cuenta.data) ? cuenta.data[0] : null) as
    | { email: string | null; creado: string | null; ultimo_acceso: string | null }
    | undefined;

  // Una suspensión con la fecha vencida ya no cuenta: la cuenta volvió sola.
  const vigente =
    Boolean(fila.suspendida) &&
    (!fila.suspendida_hasta || new Date(fila.suspendida_hasta as string).getTime() > Date.now());

  return {
    id: fila.id as string,
    nombre: fila.nombre as string,
    logo_url: (fila.logo_url as string | null) ?? null,
    telefono_contacto: (fila.telefono_contacto as string | null) ?? null,
    rol: fila.rol as string,
    nivel: fila.nivel as 1 | 2,
    activo: Boolean(fila.activo),
    suspendida: vigente,
    suspensionMotivo: vigente ? ((fila.suspension_motivo as string | null) ?? null) : null,
    suspendidaHasta: vigente ? ((fila.suspendida_hasta as string | null) ?? null) : null,
    email: datosCuenta?.email ?? null,
    creado: datosCuenta?.creado ?? null,
    ultimoAcceso: datosCuenta?.ultimo_acceso ?? null,
  };
}

/**
 * Suspende la cuenta: no puede entrar, sus publicaciones salen del catálogo y
 * no puede crear ni editar nada (0029). `dias` null = indefinida.
 */
export async function suspenderCuenta(perfilId: string, motivo: string, dias: number | null): Promise<void> {
  const { error } = await supabase.rpc('suspender_cuenta', {
    p_usuario: perfilId,
    p_motivo: motivo,
    p_dias: dias,
  });
  if (error) throw error;
}

export async function reactivarCuenta(perfilId: string): Promise<void> {
  const { error } = await supabase.rpc('reactivar_cuenta', { p_usuario: perfilId });
  if (error) throw error;
}

export type PublicacionDeUsuario = {
  id: string;
  comuna_id: string | null;
  titulo: string;
  logo_url: string | null;
  estado: 'pendiente' | 'aprobado' | 'rechazado';
  created_at: string;
  categoria: { nombre: string } | null;
  comuna: { nombre: string } | null;
};

/** Todo lo que publicó, en cualquier comuna y estado. Lo dado de baja no. */
export async function fetchPublicacionesDeUsuario(perfilId: string): Promise<PublicacionDeUsuario[]> {
  const { data, error } = await supabase
    .from('publicaciones')
    .select('id, comuna_id, titulo, logo_url, estado, created_at, categoria:categorias(nombre), comuna:comunas(nombre)')
    .eq('usuario_id', perfilId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as PublicacionDeUsuario[]) ?? [];
}

/**
 * Da de baja una publicación: deja de verse en el catálogo pero no se borra
 * (se puede recuperar hasta que la limpieza la purgue, a los 6 meses). Es lo
 * que puede hacer un administrador de zona en sus comunas.
 */
export async function darDeBajaPublicacion(publicacionId: string): Promise<void> {
  const { data, error } = await supabase
    .from('publicaciones')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', publicacionId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo dar de baja la publicación.');
}

/**
 * Libre publicación = nivel 2: lo que publica sale directo, sin pasar por
 * "Aprobar". Lo decide el trigger `fn_set_estado_publicacion` al crear cada
 * publicación, así que el cambio vale para lo que publique de aquí en adelante;
 * lo que ya espera aprobación se resuelve a mano.
 */
/** El permiso "Editar" de un usuario: apagado, no puede cambiar sus publicaciones (0033). */
export async function actualizarPuedeEditar(perfilId: string, puedeEditar: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ puede_editar: puedeEditar })
    .eq('id', perfilId)
    .select('id');
  if (error) {
    if (error.code === '42703' || error.code === 'PGRST204') {
      throw new Error('Falta ejecutar la migración 0033 en Supabase para usar el permiso "Editar".');
    }
    throw error;
  }
  if (!data || data.length === 0) throw new Error('No se pudo cambiar el permiso. Revisa que tu cuenta sea de administrador.');
}

/** Cuántas publicaciones vigentes (no dadas de baja) tiene cada usuario, en todas las comunas. */
export async function contarPublicacionesDeUsuarios(ids: string[]): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from('publicaciones')
    .select('usuario_id')
    .in('usuario_id', ids)
    .is('deleted_at', null);
  if (error) throw error;
  const cuentas: Record<string, number> = {};
  for (const fila of (data as { usuario_id: string }[]) ?? []) {
    cuentas[fila.usuario_id] = (cuentas[fila.usuario_id] ?? 0) + 1;
  }
  return cuentas;
}

/** El correo de una cuenta (vive fuera de la API: lo entrega una función solo para administradores). */
export async function fetchCorreoDeCuenta(perfilId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('admin_datos_de_cuenta', { p_perfil: perfilId });
  if (error) return null;
  const fila = (Array.isArray(data) ? data[0] : null) as { email: string | null } | undefined;
  return fila?.email ?? null;
}

/** Una publicación para revisar en el panel: como en el inicio, más su estado y fecha. */
export type PublicacionEnRevision = PublicacionResumen & {
  estado: 'pendiente' | 'aprobado' | 'rechazado';
  created_at: string;
  usuario_id: string;
};

/**
 * Las publicaciones que el panel muestra en tarjetas, como se ven en el
 * inicio: las pendientes de aprobar (Aprobar) o todas las de un usuario.
 * Las dadas de baja no aparecen. Lo que cada administrador alcanza a ver lo
 * decide la base (RLS): el de zona, solo lo de su zona.
 */
export async function fetchPublicacionesEnRevision(filtro: {
  soloPendientes?: boolean;
  usuarioId?: string;
  /** Solo las de esta comuna y categoría (la vista de un perfil desde su categoría). */
  comunaId?: string;
  categoriaId?: string;
  estado?: 'pendiente' | 'aprobado' | 'rechazado';
}): Promise<PublicacionEnRevision[]> {
  let request = supabase
    .from('publicaciones')
    .select(
      'id, titulo, descripcion, logo_url, telefono, destacado, categoria_id, estado, created_at, usuario_id, categoria:categorias(nombre, icono), comuna:comunas(nombre), productos(nombre, precio, imagen_url, orden)',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (filtro.soloPendientes) request = request.eq('estado', 'pendiente');
  if (filtro.usuarioId) request = request.eq('usuario_id', filtro.usuarioId);
  if (filtro.comunaId) request = request.eq('comuna_id', filtro.comunaId);
  if (filtro.categoriaId) request = request.eq('categoria_id', filtro.categoriaId);
  if (filtro.estado) request = request.eq('estado', filtro.estado);
  const { data, error } = await request;
  if (error) throw error;
  return (data as unknown as PublicacionEnRevision[]) ?? [];
}

/** Un banner de un perfil, para verlo desde el panel. */
export type BannerDePerfil = { id: string; imagen_url: string; fecha_fin: string | null };

/** Los banners que un perfil tiene mostrándose en una comuna. */
export async function fetchBannersDePerfil(usuarioId: string, comunaId: string): Promise<BannerDePerfil[]> {
  const { data, error } = await supabase
    .from('banners')
    .select('id, imagen_url, fecha_fin')
    .eq('usuario_id', usuarioId)
    .eq('comuna_id', comunaId)
    .eq('activo', true)
    .or(`fecha_fin.is.null,fecha_fin.gte.${new Date().toISOString()}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as BannerDePerfil[]) ?? [];
}

export async function actualizarNivelPerfil(perfilId: string, nivel: 1 | 2): Promise<void> {
  const { data, error } = await supabase.from('profiles').update({ nivel }).eq('id', perfilId).select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('No se pudo cambiar el permiso. Revisa que tu cuenta sea de administrador.');
  }
}

/**
 * Cómo está la visibilidad de la propia cuenta: `pausado` lo maneja el
 * comerciante; `ocultoPorAdmin` es del administrador y manda sobre lo otro.
 * `disponible` es false si la base todavía no tiene la migración 0038.
 */
export async function fetchMiVisibilidad(): Promise<{ pausado: boolean; ocultoPorAdmin: boolean; disponible: boolean }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { pausado: false, ocultoPorAdmin: false, disponible: false };
  const { data, error } = await supabase.from('profiles').select('activo, pausado').eq('id', auth.user.id).maybeSingle();
  if (error?.code === '42703') return { pausado: false, ocultoPorAdmin: false, disponible: false };
  if (error) throw error;
  return { pausado: Boolean(data?.pausado), ocultoPorAdmin: data?.activo === false, disponible: true };
}

/** El comerciante pausa (o vuelve a mostrar) su perfil, de forma voluntaria. */
export async function pausarMiPerfil(pausado: boolean): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Inicia sesión de nuevo.');
  const { data, error } = await supabase.from('profiles').update({ pausado }).eq('id', auth.user.id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo cambiar la visibilidad de tu perfil.');
}

/**
 * Precios por día de los banners (0043): por región y, si tiene, por comuna.
 * `disponible` es false si la base todavía no tiene la migración.
 */
export type PreciosBanner = {
  regiones: Record<string, number>;
  comunas: Record<string, number>;
  disponible: boolean;
};

export async function fetchPreciosBanner(): Promise<PreciosBanner> {
  const [regiones, comunas] = await Promise.all([
    supabase.from('precios_banner_region').select('region, precio'),
    supabase.from('comunas').select('id, precio_banner').not('precio_banner', 'is', null),
  ]);
  if (regiones.error || comunas.error) return { regiones: {}, comunas: {}, disponible: false };
  return {
    regiones: Object.fromEntries((regiones.data ?? []).map((r) => [r.region as string, r.precio as number])),
    comunas: Object.fromEntries((comunas.data ?? []).map((c) => [c.id as string, c.precio_banner as number])),
    disponible: true,
  };
}

/** Lo que cuesta por día un banner en una comuna: el suyo, el de su región o el base. */
export function precioBannerEn(comuna: { id: string; region?: string | null }, precios: PreciosBanner | null): number {
  if (!precios) return PRECIO_BANNER_POR_DIA;
  return precios.comunas[comuna.id] ?? (comuna.region ? precios.regiones[comuna.region] : undefined) ?? PRECIO_BANNER_POR_DIA;
}

/** El precio por día de una región; null lo quita (sus comunas usan el base). */
export async function guardarPrecioRegion(region: string, precio: number | null): Promise<void> {
  const { error } =
    precio === null
      ? await supabase.from('precios_banner_region').delete().eq('region', region)
      : await supabase.from('precios_banner_region').upsert({ region, precio, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** El precio por día de una comuna; null lo quita (usa el de su región). */
export async function guardarPrecioComuna(comunaId: string, precio: number | null): Promise<void> {
  const { data, error } = await supabase.from('comunas').update({ precio_banner: precio }).eq('id', comunaId).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo guardar el precio. Revisa que tu cuenta sea de administrador.');
}

/**
 * Banners GIF o video que ya vencieron (pedido del cliente: que no ocupen
 * espacio en Supabase). Se borran solos, con su archivo, un día después de
 * terminar — no a los seis meses como las fotos: pesan mucho más y no se
 * reutilizan. Los pausados no se tocan (se pueden reanudar). Lo llama la
 * pantalla de Banners del admin cada vez que se abre; devuelve cuántos borró.
 */
export async function purgarMediosVencidos(): Promise<number> {
  const corte = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let consulta = supabase
    .from('banners')
    .select('id, imagen_url')
    .lt('fecha_fin', corte)
    .or('imagen_url.ilike.%.gif,imagen_url.ilike.%.mp4');
  // Sin la migración 0041 no existe la pausa: se consulta sin ese filtro.
  const conPausa = await consulta.is('pausado_en', null);
  let filas = conPausa.data;
  if (faltaColumnaNueva(conPausa.error)) {
    consulta = supabase
      .from('banners')
      .select('id, imagen_url')
      .lt('fecha_fin', corte)
      .or('imagen_url.ilike.%.gif,imagen_url.ilike.%.mp4');
    filas = (await consulta).data;
  }
  let borrados = 0;
  for (const fila of filas ?? []) {
    try {
      await eliminarBanner(fila.id as string);
      borrados += 1;
    } catch {
      // Sin permiso sobre ese banner (otro admin de zona): queda para quien lo tenga.
    }
  }
  return borrados;
}

// ============================================================================
// Métricas (0045)
// ============================================================================

export type TipoEvento = 'banner_clic' | 'categoria' | 'publicacion_vista' | 'publicacion_completa' | 'banner_vista';

/** Lo ya contado en esta apertura de la app: cada cosa se cuenta una vez por sesión. */
const eventosDeLaSesion = new Set<string>();

/**
 * Suma un evento a las métricas (un número por día, comuna y categoría; ver
 * 0045). Con `publicacionId`, la comuna y la categoría las pone la base. Se
 * cuenta una sola vez por sesión cada cosa (`una`: qué se está contando), y
 * falla en silencio: una métrica perdida no vale interrumpir a nadie.
 */
export function registrarEvento(
  tipo: TipoEvento,
  datos: { comunaId?: string | null; categoriaId?: string | null; publicacionId?: string | null },
  una?: string,
): void {
  if (una) {
    const clave = `${tipo}:${una}`;
    if (eventosDeLaSesion.has(clave)) return;
    eventosDeLaSesion.add(clave);
  }
  void supabase
    .rpc('registrar_evento', {
      p_tipo: tipo,
      p_comuna: datos.comunaId ?? null,
      p_categoria: datos.categoriaId ?? null,
      p_publicacion: datos.publicacionId ?? null,
    })
    .then(
      () => {},
      () => {},
    );
}

/** Un inicio de sesión de un negocio (se cuenta en cada comuna y categoría donde publica). */
export function registrarLogin(): void {
  void supabase.rpc('registrar_login').then(
    () => {},
    () => {},
  );
}

export type FilaMetrica = { tipo: string; comuna_id: string; categoria_id: string; total: number };

/**
 * Los totales para el panel entre dos días (AAAA-MM-DD, los dos incluidos);
 * null = sin límite. Con la base anterior a 0048 se usa solo "desde".
 */
export async function fetchResumenMetricas(desde: string | null, hasta: string | null = null): Promise<FilaMetrica[]> {
  let { data, error } = await supabase.rpc('metricas_resumen', { p_desde: desde, p_hasta: hasta });
  if (error && (error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? ''))) {
    ({ data, error } = await supabase.rpc('metricas_resumen', { p_desde: desde }));
  }
  if (error) {
    if (error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? '')) {
      throw new Error('Falta ejecutar la migración 0045 en Supabase para las métricas.');
    }
    throw error;
  }
  return ((data ?? []) as { tipo: string; comuna_id: string; categoria_id: string; total: number | string }[]).map((f) => ({
    ...f,
    total: Number(f.total),
  }));
}

// ============================================================================
// Copias de seguridad de la configuración (0046)
// ============================================================================

export type CopiaSeguridad = { id: string; nombre: string; created_at: string };

const FALTA_0046 = 'Falta ejecutar la migración 0046 en Supabase para las copias de seguridad.';
const esFaltaFuncion = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST202' || e.code === '42P01' || e.code === 'PGRST205' || /could not find|does not exist/i.test(e.message ?? '');

export async function fetchCopiasSeguridad(): Promise<CopiaSeguridad[]> {
  const { data, error } = await supabase
    .from('copias_seguridad')
    .select('id, nombre, created_at')
    .order('created_at', { ascending: false });
  if (error) throw esFaltaFuncion(error) ? new Error(FALTA_0046) : error;
  return (data as CopiaSeguridad[]) ?? [];
}

/** Guarda cómo está configurada la app ahora (categorías por comuna, comunas visibles y precios). */
export async function crearCopiaSeguridad(nombre?: string): Promise<void> {
  const { error } = await supabase.rpc('crear_copia_seguridad', { p_nombre: nombre ?? null });
  if (error) throw esFaltaFuncion(error) ? new Error(FALTA_0046) : error;
}

/** Vuelve a una copia. Antes guarda sola una copia "Antes de restaurar", para poder deshacerlo. */
export async function restaurarCopiaSeguridad(id: string): Promise<void> {
  const { error } = await supabase.rpc('restaurar_copia_seguridad', { p_copia: id });
  if (error) throw esFaltaFuncion(error) ? new Error(FALTA_0046) : error;
}

export async function eliminarCopiaSeguridad(id: string): Promise<void> {
  const { error } = await supabase.from('copias_seguridad').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================================
// Espacio usado (0047)
// ============================================================================

/** Límites del plan gratuito de Supabase (Panel → Usage). Si se cambia de plan, se cambian acá. */
export const LIMITES_PLAN = {
  baseDeDatos: 500 * 1024 * 1024,
  archivos: 1024 * 1024 * 1024,
} as const;

export type EspacioUsado = { baseDeDatos: number; archivos: Record<string, number> };

/** Cuánto ocupan la base de datos y cada carpeta de archivos, en bytes. */
export async function fetchEspacioUsado(): Promise<EspacioUsado> {
  const { data, error } = await supabase.rpc('espacio_usado');
  if (error) {
    if (error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? '')) {
      throw new Error('Falta ejecutar la migración 0047 en Supabase para ver el espacio usado.');
    }
    throw error;
  }
  const filas = (data ?? []) as { tipo: string; bytes: number | string }[];
  const archivos: Record<string, number> = {};
  let baseDeDatos = 0;
  for (const f of filas) {
    if (f.tipo === 'base_de_datos') baseDeDatos = Number(f.bytes);
    else archivos[f.tipo] = Number(f.bytes);
  }
  return { baseDeDatos, archivos };
}

// ============================================================================
// El comerciante cambia sus datos desde Perfil (tocando cada uno)
// ============================================================================

/** El teléfono de contacto (ya con +56); la base lo copia a sus publicaciones. */
export async function cambiarMiTelefono(telefono: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Inicia sesión de nuevo.');
  const { error } = await supabase.from('profiles').update({ telefono_contacto: telefono }).eq('id', auth.user.id);
  if (error) throw error;
}

/** La foto del perfil. */
export async function cambiarMiFoto(logoUrl: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Inicia sesión de nuevo.');
  const { error } = await supabase.from('profiles').update({ logo_url: logoUrl }).eq('id', auth.user.id);
  if (error) throw error;
}

/**
 * El correo con que se entra. Supabase manda un correo para confirmarlo: el
 * cambio vale recién cuando se confirma.
 */
export async function cambiarMiCorreo(correo: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email: correo.trim() });
  if (error) {
    if (/already|registered|exists/i.test(error.message ?? '')) throw new Error('Ese correo ya tiene una cuenta.');
    throw error;
  }
}
