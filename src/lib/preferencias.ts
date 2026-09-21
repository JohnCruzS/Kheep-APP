import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Categoria } from '@/lib/catalog';

/**
 * Categorías de "acceso rápido", al estilo de Marketplace de Facebook: cada
 * teléfono lleva la cuenta de cuántas veces el usuario toca una categoría o
 * abre una publicación de ella, y las que más usa se muestran primero.
 *
 * Se guarda solo en el teléfono (AsyncStorage): no hace falta cuenta, no
 * sale del dispositivo y no cuesta consultas a Supabase. El orden manual que
 * define el admin sigue siendo la base; esto solo adelanta las favoritas.
 */
const CLAVE = 'kheep:uso-categorias';

/**
 * Usos mínimos para que una categoría suba al frente. Sin este mínimo, un
 * solo toque de curiosidad ya reordenaría la fila entera.
 */
const MIN_USOS = 3;

export type UsoCategorias = Record<string, number>;

export async function leerUsoCategorias(): Promise<UsoCategorias> {
  try {
    const raw = await AsyncStorage.getItem(CLAVE);
    return raw ? (JSON.parse(raw) as UsoCategorias) : {};
  } catch {
    return {};
  }
}

// Las escrituras van en fila: con toques rápidos, dos lecturas en paralelo
// pisarían el conteo una de la otra y se perderían usos.
let cola: Promise<void> = Promise.resolve();

export function registrarUsoCategoria(id: string | null | undefined): void {
  if (!id) return;
  cola = cola.then(async () => {
    try {
      const uso = await leerUsoCategorias();
      uso[id] = (uso[id] ?? 0) + 1;
      await AsyncStorage.setItem(CLAVE, JSON.stringify(uso));
    } catch {
      // Es una comodidad: si no se pudo guardar, la app sigue igual.
    }
  });
}

/** Cuántas favoritas se adelantan al frente de la fila. */
const FAVORITAS = 3;

/**
 * Adelanta las tres categorías que más usa esta persona y deja el resto en el
 * orden que definió el admin para esa comuna.
 *
 * Tres y no todas: el orden por comuna es una decisión del admin, y adelantar
 * cada categoría con unos cuantos toques lo deshacía casi entero. Con las tres
 * primeras alcanza para el atajo —lo que el usuario abre siempre queda a
 * mano— y de la cuarta en adelante manda el admin.
 *
 * Hace falta superar MIN_USOS: sin ese mínimo, un toque de curiosidad ya
 * cambiaría el frente del catálogo.
 */
export function ordenarPorUso<T extends Categoria>(categorias: T[], uso: UsoCategorias): T[] {
  const favoritas = categorias
    .filter((categoria) => (uso[categoria.id] ?? 0) >= MIN_USOS)
    // Más usos primero; en empate gana la que el admin puso antes, porque
    // `sort` mantiene el orden original de las iguales.
    .sort((a, b) => (uso[b.id] ?? 0) - (uso[a.id] ?? 0))
    .slice(0, FAVORITAS);

  if (favoritas.length === 0) return categorias;

  const adelantadas = new Set(favoritas.map((c) => c.id));
  return [...favoritas, ...categorias.filter((c) => !adelantadas.has(c.id))];
}
