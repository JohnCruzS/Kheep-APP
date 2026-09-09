import * as Location from 'expo-location';

import type { Comuna } from '@/lib/catalog';
import { normalizarTexto } from '@/lib/text';

/**
 * Detecta en qué comuna está el usuario ahora mismo, para preseleccionarla
 * en el catálogo — nunca reemplaza la elección manual del selector, solo la
 * sugiere la primera vez. Si el usuario no da permiso, no hay GPS, o la
 * comuna detectada no calza con ninguna de nuestra lista (puede pasar fuera
 * de Chile, o con nombres que el proveedor de mapas arma distinto), se
 * devuelve `null` en silencio — la app sigue funcionando con "Todas las
 * comunas" como hasta ahora, no es un error visible para nadie.
 */
export async function detectarComunaActual(comunas: Comuna[]): Promise<string | null> {
  try {
    const permisoActual = await Location.getForegroundPermissionsAsync();
    let concedido = permisoActual.status === 'granted';

    if (!concedido) {
      const solicitado = await Location.requestForegroundPermissionsAsync();
      concedido = solicitado.status === 'granted';
    }
    if (!concedido) return null;

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
