import * as Location from 'expo-location';

import type { Comuna } from '@/lib/catalog';
import { normalizarTexto } from '@/lib/text';

/** ¿Ya está concedido el permiso? No abre ningún diálogo. */
export async function tienePermisoUbicacion(): Promise<boolean> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Pide el permiso de ubicación y responde si quedó concedido.
 *
 * Está separado de la detección a propósito: la pantalla de bienvenida
 * necesita saber la respuesta del usuario para elegir el camino (identificar
 * su comuna, o mandarlo a elegirla a mano) y no puede hacerlo si el permiso
 * se pide escondido dentro de la búsqueda de coordenadas. Android solo
 * muestra el diálogo la primera vez; después responde al instante con lo que
 * el usuario decidió entonces.
 */
export async function pedirPermisoUbicacion(): Promise<boolean> {
  try {
    if (await tienePermisoUbicacion()) return true;
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Detecta en qué comuna está el usuario ahora mismo. Si no hay permiso, no
 * hay GPS, o la comuna detectada no calza con ninguna de nuestra lista (puede
 * pasar fuera de Chile, o con nombres que el proveedor de mapas arma
 * distinto), devuelve `null` en silencio: quien llama decide qué hacer —
 * hoy, mandar al usuario a elegir su comuna a mano.
 *
 * No pide el permiso: eso lo hace `pedirPermisoUbicacion()` antes.
 */
export async function detectarComunaActual(comunas: Comuna[]): Promise<string | null> {
  try {
    if (!(await tienePermisoUbicacion())) return null;

    // `Accuracy.Low` usa el proveedor de red, que en el emulador casi nunca
    // responde; `Balanced` sí usa GPS. Además, un límite de tiempo: el GPS
    // real puede tardar mucho en conseguir señal, y esto nunca debe dejar
    // al usuario esperando — si no hay fix rápido, simplemente no se
    // detecta nada y el catálogo sigue con "Todas las comunas".
    const posicion = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ]);
    const [lugar] = await Location.reverseGeocodeAsync({
      latitude: posicion.coords.latitude,
      longitude: posicion.coords.longitude,
    });
    if (!lugar) return null;

    // El campo donde viene el nombre de la comuna varía según el proveedor
    // del teléfono (Google Play services en Android, Apple Maps en iOS) —
    // se prueban los candidatos más probables en orden.
    const candidatos = [lugar.subregion, lugar.city, lugar.district].filter(
      (valor): valor is string => !!valor,
    );

    for (const candidato of candidatos) {
      const normalizado = normalizarTexto(candidato);
      const match = comunas.find((c) => normalizarTexto(c.nombre) === normalizado);
      if (match) return match.id;
    }
    return null;
  } catch {
    return null;
  }
}
