import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * Logos temáticos por fecha ("estilo Google Doodle"). El admin los programa
 * desde Panel Admin → Logo de la app; mientras uno está vigente reemplaza al
 * logo normal de Kheep, y al terminar su fecha la app vuelve sola al normal.
 * Ver migración 0015.
 */
export type LogoTematico = {
  id: string;
  nombre: string;
  imagen_url: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  activo: boolean;
  /** Ancho propio de este logo, en % de la pantalla. null = usa el general. */
  ancho_pct: number | null;
};

/**
 * El tamaño del título se guarda como PORCENTAJE del ancho de la pantalla
 * (ver migración 0016): un valor en píxeles se vería enorme en un teléfono
 * angosto y diminuto en uno grande. 40 % es el tamaño del diseño original
 * (400 de 1000 en la rejilla del cliente — ancho de la imagen, centrada).
 */
export const ANCHO_LOGO_DEFECTO = 40;
export const ANCHO_LOGO_MIN = 15;
export const ANCHO_LOGO_MAX = 70;

/**
 * Posición del título: espacio desde arriba de la pantalla hasta donde
 * empieza la imagen, como PORCENTAJE DEL ALTO de la pantalla (no del ancho:
 * es una medida vertical). 12 % es el margen superior del diseño original
 * (120 de 1000 en la rejilla del cliente). Ver migración 0019.
 *
 * A diferencia del ancho, este valor es siempre general — no tiene sentido
 * que cada logo temático tenga su propia posición, solo su propia forma.
 */
export const MARGEN_LOGO_DEFECTO = 12;
export const MARGEN_LOGO_MIN = 0;
export const MARGEN_LOGO_MAX = 30;

/** Lo que hay que mostrar hoy como título: qué imagen, de qué tamaño y a qué distancia de arriba. */
export type Marca = {
  /** Logo temático vigente, o null para el logo normal de la app. */
  url: string | null;
  anchoPct: number;
  margenSuperiorPct: number;
};

export function limitarAncho(pct: number): number {
  return Math.min(ANCHO_LOGO_MAX, Math.max(ANCHO_LOGO_MIN, Math.round(pct)));
}

export function limitarMargen(pct: number): number {
  return Math.min(MARGEN_LOGO_MAX, Math.max(MARGEN_LOGO_MIN, Math.round(pct)));
}

export type EstadoLogo = 'vigente' | 'programado' | 'vencido' | 'inactivo';

/** Hoy según el reloj del teléfono, en formato de base de datos (AAAA-MM-DD). */
export function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'DD/MM/AAAA' → 'AAAA-MM-DD'. Devuelve null si no es una fecha real (ej: 31/02). */
export function parseFecha(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  const d = new Date(yyyy, mm - 1, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA'. */
export function formatearFecha(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function estadoLogo(logo: LogoTematico, hoy = hoyISO()): EstadoLogo {
  if (!logo.activo) return 'inactivo';
  if (logo.fecha_inicio && logo.fecha_inicio > hoy) return 'programado';
  if (logo.fecha_fin && logo.fecha_fin < hoy) return 'vencido';
  return 'vigente';
}

/**
 * A la base todavía le falta una migración de esta funcionalidad: la tabla no
 * existe (0015) o le falta una columna (0016, el tamaño). Se distingue de un
 * error cualquiera para poder mostrar un aviso con el paso que falta en vez
 * de un "error desconocido" que no le dice nada al admin.
 */
export function esErrorMigracionFaltante(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  const codigos = ['42P01', '42703', 'PGRST204', 'PGRST205'];
  return codigos.includes(e.code ?? '') || /schema cache|does not exist/i.test(e.message ?? '');
}

/**
 * El logo vigente hoy, o null para usar el normal. Se filtra por fecha acá
 * además de en RLS: para el admin, RLS devuelve todos los logos (también los
 * programados y vencidos), y sin este filtro vería en la app un logo que no
 * corresponde a hoy — el mismo error que tuvo el catálogo con las
 * publicaciones pendientes. Cualquier fallo (incluida la tabla inexistente)
 * cae al logo normal: el logo nunca debe romper la pantalla.
 */
async function consultarLogoVigente(): Promise<{ url: string; anchoPct: number | null } | null> {
  const hoy = hoyISO();
  try {
    const { data, error } = await supabase
      .from('logos_tematicos')
      .select('imagen_url, ancho_pct')
      .eq('activo', true)
      .or(`fecha_inicio.is.null,fecha_inicio.lte.${hoy}`)
      .or(`fecha_fin.is.null,fecha_fin.gte.${hoy}`)
      .order('fecha_inicio', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    // Mientras no se aplique la 0016 la columna del tamaño no existe y la
    // consulta entera falla. En ese caso se vuelve a pedir solo la imagen: un
    // logo programado no puede dejar de verse por un ajuste que todavía no
    // está en la base.
    if (error && esErrorMigracionFaltante(error)) return await consultarLogoVigenteSinAncho(hoy);
    if (error || !data?.imagen_url) return null;
    return { url: data.imagen_url as string, anchoPct: (data.ancho_pct as number | null) ?? null };
  } catch {
    return null;
  }
}

async function consultarLogoVigenteSinAncho(hoy: string): Promise<{ url: string; anchoPct: null } | null> {
  try {
    const { data, error } = await supabase
      .from('logos_tematicos')
      .select('imagen_url')
      .eq('activo', true)
      .or(`fecha_inicio.is.null,fecha_inicio.lte.${hoy}`)
      .or(`fecha_fin.is.null,fecha_fin.gte.${hoy}`)
      .order('fecha_inicio', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data?.imagen_url) return null;
    return { url: data.imagen_url as string, anchoPct: null };
  } catch {
    return null;
  }
}

/**
 * El tamaño general que fijó el admin. Si la consulta falla (sin conexión, o
 * falta la migración 0016) se usa el de siempre: el título nunca debe quedar
 * sin dibujar por un ajuste que no se pudo leer.
 */
async function consultarAnchoGeneral(): Promise<number> {
  try {
    const { data, error } = await supabase.from('configuracion_marca').select('logo_ancho_pct').limit(1).maybeSingle();
    if (error || !data) return ANCHO_LOGO_DEFECTO;
    return limitarAncho((data.logo_ancho_pct as number | null) ?? ANCHO_LOGO_DEFECTO);
  } catch {
    return ANCHO_LOGO_DEFECTO;
  }
}

/**
 * El margen superior general que fijó el admin. Mismo criterio que el ancho:
 * si falla la consulta (sin conexión, o falta la migración 0019 en un
 * entorno que todavía no la aplicó) se usa el margen de siempre.
 */
async function consultarMargenGeneral(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('configuracion_marca')
      .select('logo_margen_superior_pct')
      .limit(1)
      .maybeSingle();
    if (error || !data) return MARGEN_LOGO_DEFECTO;
    return limitarMargen((data.logo_margen_superior_pct as number | null) ?? MARGEN_LOGO_DEFECTO);
  } catch {
    return MARGEN_LOGO_DEFECTO;
  }
}

/** El logo temático manda sobre el tamaño general solo si definió el suyo; la posición siempre es la general. */
async function consultarMarca(): Promise<Marca> {
  const [anchoGeneral, margenGeneral, logo] = await Promise.all([
    consultarAnchoGeneral(),
    consultarMargenGeneral(),
    consultarLogoVigente(),
  ]);
  return {
    url: logo?.url ?? null,
    anchoPct: logo?.anchoPct != null ? limitarAncho(logo.anchoPct) : anchoGeneral,
    margenSuperiorPct: margenGeneral,
  };
}

// Se consulta una sola vez por sesión de la app y se comparte entre todas
// las pantallas que muestran el logo; el admin fuerza una recarga al cambiar
// algo, y los logos ya dibujados se actualizan solos.
const MARCA_NORMAL: Marca = { url: null, anchoPct: ANCHO_LOGO_DEFECTO, margenSuperiorPct: MARGEN_LOGO_DEFECTO };

let cache: Marca | undefined;
let pendiente: Promise<Marca> | null = null;
const suscriptores = new Set<(marca: Marca) => void>();

function cargarMarca(): Promise<Marca> {
  if (!pendiente) {
    pendiente = consultarMarca().then((marca) => {
      cache = marca;
      suscriptores.forEach((avisar) => avisar(marca));
      return marca;
    });
  }
  return pendiente;
}

/**
 * Vuelve a preguntar qué logo y de qué tamaño corresponde hoy. La llama el
 * admin al cambiar algo (para verlo al instante) y el catálogo cada vez que
 * se abre, que es como el cambio del admin llega al resto de los usuarios sin
 * que tengan que cerrar la app. Es también lo que hace que un logo se retire
 * solo el día que vence: la fecha se evalúa en cada consulta.
 */
export function invalidarMarca(): void {
  cache = undefined;
  pendiente = null;
  void cargarMarca();
}

export function useMarca(): Marca {
  const [marca, setMarca] = useState<Marca>(cache ?? MARCA_NORMAL);
  useEffect(() => {
    suscriptores.add(setMarca);
    if (cache === undefined) void cargarMarca();
    else setMarca(cache);
    return () => {
      suscriptores.delete(setMarca);
    };
  }, []);
  return marca;
}

// ------------------------------- Admin ------------------------------------

export async function fetchLogosAdmin(): Promise<LogoTematico[]> {
  const { data, error } = await supabase
    .from('logos_tematicos')
    .select('id, nombre, imagen_url, fecha_inicio, fecha_fin, activo, ancho_pct')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as LogoTematico[]) ?? [];
}

export async function crearLogo(input: {
  nombre: string;
  imagenUrl: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  /** null = este logo usa el tamaño general. */
  anchoPct: number | null;
}): Promise<void> {
  const { error } = await supabase.from('logos_tematicos').insert({
    nombre: input.nombre,
    imagen_url: input.imagenUrl,
    fecha_inicio: input.fechaInicio,
    fecha_fin: input.fechaFin,
    ancho_pct: input.anchoPct === null ? null : limitarAncho(input.anchoPct),
  });
  if (error) throw error;
  invalidarMarca();
}

/** Tamaño propio de un logo ya creado. null = vuelve a usar el general. */
export async function actualizarAnchoLogo(id: string, anchoPct: number | null): Promise<void> {
  const { data, error } = await supabase
    .from('logos_tematicos')
    .update({ ancho_pct: anchoPct === null ? null : limitarAncho(anchoPct) })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo guardar el tamaño de este logo.');
  invalidarMarca();
}

/** El tamaño general: el que ve todo el mundo mientras no haya logo temático. */
export async function fetchAnchoGeneral(): Promise<number> {
  const { data, error } = await supabase.from('configuracion_marca').select('logo_ancho_pct').limit(1).maybeSingle();
  if (error) throw error;
  return limitarAncho((data?.logo_ancho_pct as number | null) ?? ANCHO_LOGO_DEFECTO);
}

/**
 * Guarda el tamaño general. Se confirma pidiendo la fila de vuelta: con RLS,
 * un UPDATE que no alcanza ninguna fila (por ejemplo, si la cuenta dejó de
 * ser admin) también "tiene éxito", y el ajuste se perdería en silencio.
 */
export async function guardarAnchoGeneral(anchoPct: number): Promise<void> {
  const { data, error } = await supabase
    .from('configuracion_marca')
    .update({ logo_ancho_pct: limitarAncho(anchoPct), updated_at: new Date().toISOString() })
    .eq('id', true)
    .select('logo_ancho_pct');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('No se pudo guardar el tamaño. Revisa que tu cuenta sea de administrador.');
  }
  invalidarMarca();
}

/** El margen superior general: la distancia desde arriba de la pantalla hasta el título. */
export async function fetchMargenGeneral(): Promise<number> {
  const { data, error } = await supabase
    .from('configuracion_marca')
    .select('logo_margen_superior_pct')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return limitarMargen((data?.logo_margen_superior_pct as number | null) ?? MARGEN_LOGO_DEFECTO);
}

/** Guarda el margen superior general. Mismo resguardo que `guardarAnchoGeneral`: se confirma pidiendo la fila de vuelta. */
export async function guardarMargenGeneral(margenSuperiorPct: number): Promise<void> {
  const { data, error } = await supabase
    .from('configuracion_marca')
    .update({ logo_margen_superior_pct: limitarMargen(margenSuperiorPct), updated_at: new Date().toISOString() })
    .eq('id', true)
    .select('logo_margen_superior_pct');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('No se pudo guardar la posición. Revisa que tu cuenta sea de administrador.');
  }
  invalidarMarca();
}

/**
 * Devuelve el título a las medidas originales del diseño: 40 % de ancho y
 * 12 % de margen superior — las que el cliente midió en su plantilla (400 y
 * 120 sobre una rejilla de 1000).
 *
 * Es una sola escritura y no dos seguidas a propósito: si la primera pasara y
 * la segunda fallara, el título quedaría con una medida nueva y otra vieja,
 * que es peor que no haber restablecido nada.
 */
export async function restablecerMedidasPorDefecto(): Promise<void> {
  const { data, error } = await supabase
    .from('configuracion_marca')
    .update({
      logo_ancho_pct: ANCHO_LOGO_DEFECTO,
      logo_margen_superior_pct: MARGEN_LOGO_DEFECTO,
      updated_at: new Date().toISOString(),
    })
    .eq('id', true)
    .select('logo_ancho_pct, logo_margen_superior_pct');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('No se pudieron restablecer las medidas. Revisa que tu cuenta sea de administrador.');
  }
  invalidarMarca();
}

export async function actualizarLogoActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from('logos_tematicos').update({ activo }).eq('id', id);
  if (error) throw error;
  invalidarMarca();
}

/** Se confirma pidiendo la fila de vuelta: con RLS, un DELETE sin efecto también "tiene éxito". */
export async function eliminarLogo(id: string): Promise<void> {
  const { data, error } = await supabase.from('logos_tematicos').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo eliminar el logo.');
  invalidarMarca();
}
