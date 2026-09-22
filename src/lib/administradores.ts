import { createClient } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

/**
 * Administradores de zona: cuentas con permisos solo en algunas comunas o
 * regiones (ver migración 0027). Los asigna el administrador general.
 */

export type PermisoZona = 'moderar' | 'categorias' | 'publicaciones' | 'banners' | 'suspender';

export const PERMISOS_ZONA: { clave: PermisoZona; nombre: string; detalle: string }[] = [
  { clave: 'moderar', nombre: 'Aprobar publicaciones', detalle: 'Aprobar o rechazar lo pendiente de su zona.' },
  { clave: 'categorias', nombre: 'Gestionar categorías', detalle: 'Ordenar, mostrar, ocultar y crear categorías.' },
  { clave: 'publicaciones', nombre: 'Dar de baja comercios', detalle: 'Quitar publicaciones de su zona.' },
  { clave: 'banners', nombre: 'Banners y métricas', detalle: 'Publicar y quitar banners, y ver las métricas.' },
  { clave: 'suspender', nombre: 'Suspender cuentas', detalle: 'Bloquear el acceso de quien publica en su zona.' },
];

/** Lo que puede hacer quien tiene la sesión abierta. */
export type PermisosAdmin = {
  /** Administrador general: todo, en todas partes. */
  esGeneral: boolean;
  permisos: PermisoZona[];
  /** Comunas que cubre (las elegidas y las de sus regiones). */
  comunas: string[];
};

export async function fetchMisPermisosAdmin(): Promise<PermisosAdmin> {
  const { data, error } = await supabase.rpc('mis_permisos_admin');
  if (error) throw error;
  const fila = (Array.isArray(data) ? data[0] : data) as
    | { es_general: boolean; permisos: string[] | null; comunas: string[] | null }
    | undefined;
  return {
    esGeneral: Boolean(fila?.es_general),
    permisos: (fila?.permisos ?? []) as PermisoZona[],
    comunas: fila?.comunas ?? [],
  };
}

/**
 * ¿Puede hacer esto en esta comuna? El general, siempre. Es solo para decidir
 * qué se muestra: la base vuelve a comprobarlo en cada acción.
 */
export function puede(permisos: PermisosAdmin | null, permiso: PermisoZona, comunaId?: string | null): boolean {
  if (!permisos) return false;
  if (permisos.esGeneral) return true;
  if (!permisos.permisos.includes(permiso)) return false;
  return comunaId === undefined ? true : !!comunaId && permisos.comunas.includes(comunaId);
}

// ------------------------------------------------------------------ panel --

export type AdminZona = {
  usuarioId: string;
  nombre: string;
  email: string;
  permisos: PermisoZona[];
  regiones: string[];
  comunas: string[];
};

export async function listarAdminsZona(): Promise<AdminZona[]> {
  const { data, error } = await supabase.rpc('listar_admins_zona');
  if (error) throw error;
  type Fila = {
    usuario_id: string;
    nombre: string | null;
    email: string;
    permisos: string[];
    regiones: string[];
    comunas: string[];
  };
  return ((data as Fila[]) ?? []).map((f) => ({
    usuarioId: f.usuario_id,
    nombre: f.nombre || f.email,
    email: f.email,
    permisos: (f.permisos ?? []) as PermisoZona[],
    regiones: f.regiones ?? [],
    comunas: f.comunas ?? [],
  }));
}

export async function asignarAdminZona(input: {
  usuarioId: string;
  permisos: PermisoZona[];
  regiones: string[];
  comunas: string[];
}): Promise<void> {
  const { error } = await supabase.rpc('asignar_admin_zona', {
    p_usuario: input.usuarioId,
    p_permisos: input.permisos,
    p_regiones: input.regiones,
    p_comunas: input.comunas,
  });
  if (error) throw error;
}

export async function quitarAdminZona(usuarioId: string): Promise<void> {
  const { error } = await supabase.rpc('quitar_admin_zona', { p_usuario: usuarioId });
  if (error) throw error;
}

/** Almacenamiento en memoria: la sesión de la cuenta nueva no se guarda en ningún lado. */
function almacenamientoDesechable() {
  const datos = new Map<string, string>();
  return {
    getItem: async (k: string) => datos.get(k) ?? null,
    setItem: async (k: string, v: string) => void datos.set(k, v),
    removeItem: async (k: string) => void datos.delete(k),
  };
}

/**
 * Crea la cuenta del nuevo administrador SIN cerrar la sesión de quien la
 * crea.
 *
 * `signUp` deja iniciada la sesión de la cuenta recién creada; hecho con el
 * cliente de siempre, el administrador general quedaría deslogueado y
 * convertido en la cuenta nueva. Por eso se usa un cliente aparte, con
 * almacenamiento en memoria, que se descarta al terminar.
 *
 * Si el correo ya tiene cuenta, no se crea otra: se devuelve esa, para
 * ascenderla.
 */
export async function crearCuentaAdministrador(input: {
  nombre: string;
  email: string;
  password: string;
}): Promise<{ usuarioId: string; yaExistia: boolean }> {
  const email = input.email.trim().toLowerCase();

  const existente = await supabase.rpc('buscar_cuenta_por_correo', { p_email: email });
  if (existente.error) throw existente.error;
  if (existente.data) return { usuarioId: existente.data as string, yaExistia: true };

  const aparte = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: {
      storage: almacenamientoDesechable(),
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await aparte.auth.signUp({
    email,
    password: input.password,
    options: { data: { nombre: input.nombre.trim() } },
  });
  if (error) throw error;
  if (!data.user) throw new Error('No se pudo crear la cuenta.');
  return { usuarioId: data.user.id, yaExistia: false };
}
