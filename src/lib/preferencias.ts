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

/**
 * Adelanta las categorías con al menos MIN_USOS usos, de más a menos usada.
 * El resto queda en el orden que definió el admin (y los empates también se
 * resuelven por ese orden).
 */
export function ordenarPorUso<T extends Categoria>(categorias: T[], uso: UsoCategorias): T[] {
  return categorias
    .map((categoria, posicion) => ({ categoria, posicion, usos: uso[categoria.id] ?? 0 }))
    .sort((a, b) => {
      const aFavorita = a.usos >= MIN_USOS;
      const bFavorita = b.usos >= MIN_USOS;
      if (aFavorita !== bFavorita) return aFavorita ? -1 : 1;
      if (aFavorita && a.usos !== b.usos) return b.usos - a.usos;
      return a.posicion - b.posicion;
    })
    .map((x) => x.categoria);
}
