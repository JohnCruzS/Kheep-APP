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
  telefono: string;
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
 */
export async function crearPublicacion(input: NuevaPublicacion): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Debes iniciar sesión para publicar.');

  const { data: publicacion, error } = await supabase
    .from('publicaciones')
    .insert({
      usuario_id: auth.user.id,
      titulo: input.titulo,
      telefono: input.telefono,
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
