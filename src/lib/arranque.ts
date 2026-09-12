import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Lo que la app recuerda del primer arranque: en qué comuna quedó el usuario.
 *
 * Se guarda solo en el teléfono (AsyncStorage), como las categorías favoritas:
 * no hace falta tener cuenta —el catálogo es público— y así la bienvenida con
 * el permiso de ubicación se muestra una sola vez y no en cada apertura.
 */
const CLAVE_COMUNA = 'kheep:comuna-elegida';

/** Valor guardado para "Todas las comunas", que no tiene id propio. */
const TODAS = 'todas';

export type ComunaGuardada =
  /** Ya pasó por la bienvenida y eligió (null = todas las comunas). */
  | { configurado: true; comunaId: string | null }
  /** Primer arranque: todavía no eligió nada. */
  | { configurado: false };

export async function leerComunaGuardada(): Promise<ComunaGuardada> {
  try {
    const valor = await AsyncStorage.getItem(CLAVE_COMUNA);
    if (valor === null) return { configurado: false };
    return { configurado: true, comunaId: valor === TODAS ? null : valor };
  } catch {
    // Si el almacenamiento falla, se trata como primer arranque: es preferible
    // repetir la bienvenida que dejar la app sin comuna y sin forma de elegir.
    return { configurado: false };
  }
}

export async function guardarComunaElegida(comunaId: string | null): Promise<void> {
  try {
    await AsyncStorage.setItem(CLAVE_COMUNA, comunaId ?? TODAS);
  } catch {
    // Solo significa que la próxima vez volverá a preguntar. No vale la pena
    // interrumpir al usuario por esto.
  }
}
