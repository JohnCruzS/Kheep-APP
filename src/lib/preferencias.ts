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
 * Pone primera la categoría que más usa este usuario y deja TODAS las demás
 * en el orden que definió el admin para esa comuna.
 *
 * Se adelanta una sola, no varias: el orden por comuna es una decisión del
 * admin y adelantar cada categoría con unos cuantos toques lo deshacía casi
 * entero, de modo que el catálogo ya no se parecía a lo que él había dejado.
 * Con una basta para el atajo —la que el usuario abre siempre queda a mano— y
 * el resto sigue contando la historia que el admin quiso contar.
 *
 * Hace falta superar MIN_USOS: sin ese mínimo, un solo toque de curiosidad ya
 * cambiaría la primera categoría del catálogo.
 */
export function ordenarPorUso<T extends Categoria>(categorias: T[], uso: UsoCategorias): T[] {
  let favorita: T | null = null;
  let masUsos = MIN_USOS - 1;

  for (const categoria of categorias) {
    const usos = uso[categoria.id] ?? 0;
    // Estrictamente mayor: ante un empate gana la que el admin puso antes,
    // que es la que ya viene primera en la lista.
    if (usos > masUsos) {
      masUsos = usos;
      favorita = categoria;
    }
  }

  if (!favorita) return categorias;
  return [favorita, ...categorias.filter((c) => c.id !== favorita!.id)];
}
