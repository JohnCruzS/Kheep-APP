/**
 * Las regiones de Chile en orden geográfico, de norte a sur, con el nombre
 * corto con que se muestran en la app (documento EDIT APP: "orden
 * geográfico norte-sur y título simple").
 *
 * La clave es el nombre tal como está guardado en `comunas.region`.
 */
const REGIONES: { clave: string; nombre: string }[] = [
  { clave: 'Región de Arica y Parinacota', nombre: 'Arica' },
  { clave: 'Región de Tarapacá', nombre: 'Tarapacá' },
  { clave: 'Región de Antofagasta', nombre: 'Antofagasta' },
  { clave: 'Región de Atacama', nombre: 'Atacama' },
  { clave: 'Región de Coquimbo', nombre: 'Coquimbo' },
  { clave: 'Región de Valparaíso', nombre: 'Valparaíso' },
  { clave: 'Región Metropolitana', nombre: 'Santiago' },
  { clave: "Región del Libertador Bernardo O'Higgins", nombre: "O'Higgins" },
  { clave: 'Región del Maule', nombre: 'Maule' },
  { clave: 'Región de Ñuble', nombre: 'Ñuble' },
  { clave: 'Región del Biobío', nombre: 'Biobío' },
  { clave: 'Región de la Araucanía', nombre: 'Araucanía' },
  { clave: 'Región de Los Ríos', nombre: 'Los Ríos' },
  { clave: 'Región de Los Lagos', nombre: 'Los Lagos' },
  { clave: 'Región de Aysén', nombre: 'Aysén' },
  { clave: 'Región de Magallanes y de la Antártica Chilena', nombre: 'Magallanes' },
];

const POSICION = new Map(REGIONES.map((r, i) => [r.clave, i]));
const NOMBRE = new Map(REGIONES.map((r) => [r.clave, r.nombre]));

/** Nombre corto para mostrar. Una región que no esté en la lista pierde solo el "Región de". */
export function nombreRegion(region: string | null): string {
  if (!region) return 'Sin región';
  return NOMBRE.get(region) ?? region.replace(/^Regi[oó]n (de |del |de la )?/i, '');
}

/** Para ordenar de norte a sur; las desconocidas van al final, por nombre. */
export function compararRegiones(a: string | null, b: string | null): number {
  const pa = POSICION.get(a ?? '') ?? REGIONES.length;
  const pb = POSICION.get(b ?? '') ?? REGIONES.length;
  return pa !== pb ? pa - pb : (a ?? '').localeCompare(b ?? '', 'es');
}
