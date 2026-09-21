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
};

/**
 * El título se coloca por coordenadas en la rejilla del cliente, donde el
 * ANCHO de la pantalla vale 1000. Todas las medidas —incluidas las verticales—
 * van en esa misma unidad, que es como está hecha su plantilla:
 *
 *     120  desde arriba de la pantalla hasta el título
 *     110  alto del título (sale solo: 400 de ancho ÷ la proporción de la
 *          imagen, que es 483×143)
 *     110  del título hasta el banner
 *     ---
 *     340  el perímetro: todo lo que hay de arriba al banner
 *
 * Que las medidas verticales usen el ancho como referencia no es un descuido:
 * es lo que mantiene el bloque proporcionado. Si el alto se midiera contra el
 * alto de la pantalla, en un teléfono alargado el título se estiraría y en uno
 * ancho se aplastaría.
 */

/** Alto del perímetro, en unidades (milésimas del ancho de pantalla). */
export const PERIMETRO_ALTO = 340;
/** Margen lateral del catálogo: el perímetro es tan ancho como el banner. */
export const MARGEN_LATERAL = 75;

/** Centro del título de izquierda a derecha. 500 = el centro de la pantalla. */
export const CENTRO_X_DEFECTO = 500;
/**
 * La posición ORIGINAL del título, la de la plantilla del cliente:
 *
 *     120  desde el borde de arriba hasta el título
 *     110  alto del título
 *     400  ancho del título
 *
 * El centro queda entonces a 120 + 110/2 = 175 del borde. Estas son las
 * medidas a las que vuelve el botón "Volver a las medidas originales": el
 * admin puede probar lo que quiera sabiendo que siempre puede regresar acá.
 */
export const ANCHO_DEFECTO = 400;
export const ALTO_DEFECTO = 110;
export const CENTRO_Y_DEFECTO = 175;

export const MEDIDA_MAX = 1000;
/** Un logo más angosto que esto no se distingue. */
export const ANCHO_MIN = 50;
/** El centro no puede salirse del banner, que es el ancho del perímetro. */
export const CENTRO_X_MIN = MARGEN_LATERAL;
export const CENTRO_X_MAX = MEDIDA_MAX - MARGEN_LATERAL;

/** Qué imagen es el título hoy y dónde va dentro del perímetro. */
export type Marca = {
  /** Logo temático vigente, o null para el logo normal de la app. */
  url: string | null;
  centroX: number;
  ancho: number;
  alto: number;
  centroY: number;
};

/** Las tres medidas juntas, como se guardan y como las edita el admin. */
export type MedidasLogo = {
  centroX: number;
  /** Ancho de la imagen; solo afecta a lo ancho. */
  ancho: number;
  /** Alto de la imagen; solo afecta a lo alto. */
  alto: number;
  centroY: number;
};

export const MEDIDAS_POR_DEFECTO: MedidasLogo = {
  centroX: CENTRO_X_DEFECTO,
  ancho: ANCHO_DEFECTO,
  alto: ALTO_DEFECTO,
  centroY: CENTRO_Y_DEFECTO,
};

/** El alto se mueve dentro del perímetro: más allá se metería en el banner. */
export function limitarAlto(valor: number): number {
  return limitar(valor, 10, PERIMETRO_ALTO);
}

function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(valor)));
}

export function limitarCentroX(valor: number): number {
  return limitar(valor, CENTRO_X_MIN, CENTRO_X_MAX);
}

/** El título no puede salirse del perímetro por arriba ni por abajo. */
export function limitarCentroY(valor: number): number {
  return limitar(valor, 0, PERIMETRO_ALTO);
}

export function limitarAncho(valor: number): number {
  return limitar(valor, ANCHO_MIN, MEDIDA_MAX);
}

/**
 * El alto del título no se guarda: sale de su ancho y de la forma de la
 * imagen. Se muestra igual como medida propia porque es la que el cliente
 * mide en su plantilla, y moverla mueve el ancho con ella — así el logo
 * cambia de tamaño sin deformarse nunca.
 */
export function altoDesdeAncho(ancho: number, proporcion: number): number {
  return Math.round(ancho / proporcion);
}

export function anchoDesdeAlto(alto: number, proporcion: number): number {
  return limitarAncho(Math.round(alto * proporcion));
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
async function consultarLogoVigente(): Promise<string | null> {
  const hoy = hoyISO();
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
    return data.imagen_url as string;
  } catch {
    return null;
  }
}

type FilaMedidas = { logo_ancho: number | null; logo_alto: number | null; logo_centro_y: number | null };

/**
 * Lee la fila de medidas. `logo_alto` llega con la migración 0026; mientras
 * no esté aplicada se vuelve a preguntar sin esa columna —si no, la consulta
 * entera falla y el panel diría que falta una migración que sí está— y el
 * alto se toma del diseño.
 */
async function leerFila(): Promise<FilaMedidas | null> {
  const completo = await supabase
    .from('configuracion_marca')
    .select('logo_ancho, logo_alto, logo_centro_y')
    .limit(1)
    .maybeSingle();
  if (!completo.error) return completo.data as FilaMedidas | null;

  const faltaColumna =
    completo.error.code === '42703' || (completo.error.message ?? '').includes('does not exist');
  if (!faltaColumna) throw completo.error;

  const simple = await supabase
    .from('configuracion_marca')
    .select('logo_ancho, logo_centro_y')
    .limit(1)
    .maybeSingle();
  if (simple.error) throw simple.error;
  return simple.data ? ({ ...(simple.data as object), logo_alto: null } as FilaMedidas) : null;
}

/**
 * Las medidas que fijó el admin. Si la consulta falla (sin conexión, o falta
 * la migración 0020) se usan las del diseño: el título nunca debe quedar sin
 * dibujar por un ajuste que no se pudo leer.
 */
async function consultarMedidas(): Promise<MedidasLogo> {
  try {
    const data = await leerFila();
    if (!data) return MEDIDAS_POR_DEFECTO;
    return {
      // Siempre centrado a lo ancho: ver fetchMedidasLogo.
      centroX: CENTRO_X_DEFECTO,
      ancho: limitarAncho((data.logo_ancho as number | null) ?? ANCHO_DEFECTO),
      alto: limitarAlto((data.logo_alto as number | null) ?? ALTO_DEFECTO),
      centroY: limitarCentroY((data.logo_centro_y as number | null) ?? CENTRO_Y_DEFECTO),
    };
  } catch {
    return MEDIDAS_POR_DEFECTO;
  }
}

/** Qué imagen toca hoy y dónde se coloca: las medidas son las mismas para el logo normal y para los temáticos. */
async function consultarMarca(): Promise<Marca> {
  const [medidas, url] = await Promise.all([consultarMedidas(), consultarLogoVigente()]);
  return { url, ...medidas };
}

// Se consulta una sola vez por sesión de la app y se comparte entre todas
// las pantallas que muestran el logo; el admin fuerza una recarga al cambiar
// algo, y los logos ya dibujados se actualizan solos.
const MARCA_NORMAL: Marca = { url: null, ...MEDIDAS_POR_DEFECTO };

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
    .select('id, nombre, imagen_url, fecha_inicio, fecha_fin, activo')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as LogoTematico[]) ?? [];
}

export async function crearLogo(input: {
  nombre: string;
  imagenUrl: string;
  fechaInicio: string | null;
  fechaFin: string | null;
}): Promise<void> {
  const { error } = await supabase.from('logos_tematicos').insert({
    nombre: input.nombre,
    imagen_url: input.imagenUrl,
    fecha_inicio: input.fechaInicio,
    fecha_fin: input.fechaFin,
  });
  if (error) throw error;
  invalidarMarca();
}

/** Las medidas actuales del título, para editarlas en el panel. */
export async function fetchMedidasLogo(): Promise<MedidasLogo> {
  const data = await leerFila();
  return {
    // El título va siempre centrado a lo ancho (documento EDIT APP): ya no
    // hay control horizontal, así que una medida vieja fuera del centro
    // dejaría el logo corrido y sin forma de enderezarlo.
    centroX: CENTRO_X_DEFECTO,
    ancho: limitarAncho((data?.logo_ancho as number | null) ?? ANCHO_DEFECTO),
    alto: limitarAlto((data?.logo_alto as number | null) ?? ALTO_DEFECTO),
    centroY: limitarCentroY((data?.logo_centro_y as number | null) ?? CENTRO_Y_DEFECTO),
  };
}

/**
 * Guarda las tres medidas de una vez. Van juntas a propósito: si se guardaran
 * por separado y una fallara, el título quedaría a medio camino entre la
 * posición vieja y la nueva.
 *
 * Se confirma pidiendo la fila de vuelta: con RLS, un UPDATE que no alcanza
 * ninguna fila (por ejemplo, si la cuenta dejó de ser admin) también "tiene
 * éxito", y el cambio se perdería en silencio.
 */
export async function guardarMedidasLogo(medidas: MedidasLogo): Promise<void> {
  const base = {
    logo_centro_x: CENTRO_X_DEFECTO,
    logo_ancho: limitarAncho(medidas.ancho),
    logo_centro_y: limitarCentroY(medidas.centroY),
    updated_at: new Date().toISOString(),
  };

  const guardar = (valores: object) =>
    supabase.from('configuracion_marca').update(valores).eq('id', true).select('logo_ancho');

  // Con la migración 0026 se guarda también el alto; sin ella, el resto se
  // guarda igual en vez de perderse el cambio entero.
  let { data, error } = await guardar({ ...base, logo_alto: limitarAlto(medidas.alto) });
  if (error && (error.code === '42703' || (error.message ?? '').includes('does not exist'))) {
    ({ data, error } = await guardar(base));
  }
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('No se pudieron guardar las medidas. Revisa que tu cuenta sea de administrador.');
  }
  invalidarMarca();
}

/** Devuelve el título a las medidas del diseño. */
export async function restablecerMedidasPorDefecto(): Promise<void> {
  await guardarMedidasLogo(MEDIDAS_POR_DEFECTO);
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
