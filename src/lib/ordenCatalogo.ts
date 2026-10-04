/** Lo único que hace falta para ordenar: sirve tanto para el índice liviano como para la publicación completa. */
type Ordenable = { categoria_id: string | null; destacado: boolean };

/**
 * En qué orden se muestran los comercios del catálogo.
 *
 * Dentro de una categoría el orden es AL AZAR, y se vuelve a sortear en cada
 * carga: en una vitrina hiperlocal nadie debería quedar siempre primero solo
 * por haber publicado antes, y con pocos comercios por comuna esa diferencia
 * se nota mucho.
 *
 * En "Todas" el azar sería un revoltijo, así que los comercios se agrupan por
 * categoría siguiendo el orden que dejó el admin para esa comuna, y dentro de
 * cada grupo vuelven a ir al azar.
 *
 * Los destacados encabezan su grupo —para eso se destacan—, también
 * barajados entre ellos.
 */
export function ordenarCatalogo<T extends Ordenable>(
  publicaciones: T[],
  /** Ids de categorías en el orden del admin; manda en "Todas". */
  ordenCategorias: string[],
  /** Categoría elegida, o null si se está viendo "Todas". */
  categoriaId: string | null,
): T[] {
  if (categoriaId) return barajar(publicaciones);

  const posicion = new Map(ordenCategorias.map((id, i) => [id, i]));
  const grupos = new Map<number, T[]>();

  for (const publicacion of publicaciones) {
    // Las de una categoría que ya no está en la lista van al final, juntas.
    const clave = posicion.get(publicacion.categoria_id ?? '') ?? ordenCategorias.length;
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(publicacion);
    else grupos.set(clave, [publicacion]);
  }

  return [...grupos.keys()]
    .sort((a, b) => a - b)
    .flatMap((clave) => barajar(grupos.get(clave)!));
}

/**
 * Baraja dejando los destacados delante. Fisher-Yates sobre una copia: el
 * arreglo original es el que devolvió la consulta y se reutiliza en otras
 * partes de la pantalla.
 */
function barajar<T extends Ordenable>(publicaciones: T[]): T[] {
  const copia = [...publicaciones];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return [...copia.filter((p) => p.destacado), ...copia.filter((p) => !p.destacado)];
}
