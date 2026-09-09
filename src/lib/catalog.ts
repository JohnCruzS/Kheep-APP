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

export async function fetchBanners(): Promise<Banner[]> {
  const { data, error } = await supabase
    .from('banners')
    .select('id, imagen_url, orden')
    .order('orden', { ascending: true });

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

export async function fetchCategorias(): Promise<Categoria[]> {
  const { data, error } = await supabase
    .from('categorias')
    .select('id, nombre, icono, orden')
    .eq('activa', true)
    .order('orden', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

type FetchPublicacionesParams = {
  categoriaId?: string | null;
  comunaId?: string | null;
  query?: string;
};

/**
 * Lista de publicaciones del catálogo público. `estado`/`deleted_at` no se
 * mandan como filtro: la política RLS "catálogo público solo muestra
 * aprobadas y no eliminadas" ya se encarga — pedir de más simplemente
 * devolvería menos filas de las que la fila realmente permite, nunca más.
 */
export async function fetchPublicaciones({
  categoriaId,
  comunaId,
  query,
}: FetchPublicacionesParams = {}): Promise<PublicacionResumen[]> {
  let request = supabase
    .from('publicaciones')
    .select(
      'id, titulo, descripcion, logo_url, telefono, destacado, categoria:categorias(nombre, icono), comuna:comunas(nombre), productos(nombre, precio, imagen_url, orden)',
    )
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
      'id, titulo, descripcion, logo_url, telefono, destacado, categoria:categorias(nombre), comuna:comunas(nombre), productos(id, nombre, descripcion, precio, imagen_url, orden)',
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
 * cliente (ver migración 0001). Tampoco se manda `telefono`: siempre es el
 * del perfil del dueño, lo fuerza el trigger `fn_publicacion_telefono_desde_perfil`
 * (ver migración 0014), así que ni vale la pena mandarlo desde acá.
 */
export async function crearPublicacion(input: NuevaPublicacion): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Debes iniciar sesión para publicar.');

  const { data: publicacion, error } = await supabase
    .from('publicaciones')
    .insert({
      usuario_id: auth.user.id,
      titulo: input.titulo,
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
  const { error } = await supabase.from('productos').delete().eq('id', id);
  if (error) throw error;
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

// ============================================================================
// Banner de perfil — cada comerciante publica su propio banner
// ============================================================================
// El precio y el cobro real todavía no existen (falta elegir proveedor de
// pago) — `PRECIO_POR_DIA` y `pagarBanner()` son un paso simulado a
// propósito. Cuando se conecte un proveedor real, `pagarBanner` deja de
// existir tal cual: el pago se confirma desde un webhook del proveedor, no
// desde la app — ver la nota en la migración 0012.
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
