import { useSyncExternalStore } from 'react';
import { useWindowDimensions } from 'react-native';

import { REJILLA, u } from '@/lib/rejilla';

/**
 * El alto de las tarjetas del panel del admin, para que todas las listas de
 * tarjetas (Comunas, categorías, Informe, Admin…) midan exactamente lo mismo
 * y al pasar de una vista a otra no se note cambio de tamaño (pedido del
 * cliente). El panel lo mide al dibujarse; las regiones de Comunas también lo
 * calculan, por si se entra por ahí primero.
 */
let alto: number | undefined;
const oyentes = new Set<() => void>();

export function fijarAltoTarjeta(nuevo: number) {
  const redondeado = Math.round(nuevo);
  if (redondeado <= 0 || redondeado === alto) return;
  alto = redondeado;
  oyentes.forEach((o) => o());
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

/** Separación entre tarjetas: la del panel del admin. */
export const SEPARACION_TARJETA = u(REJILLA.margenLateral);

/**
 * El alto de tarjeta a usar. Si todavía no se midió el panel, una estimación
 * con la misma regla del panel (el de la maqueta como mucho).
 */
export function useAltoTarjeta(): number {
  const medido = useSyncExternalStore(suscribir, () => alto);
  const { height } = useWindowDimensions();
  if (medido) return medido;
  // Pantalla menos barra de estado, encabezado, barra de abajo y "Salir",
  // repartido en las 5 tarjetas del panel.
  const estimado = (height - 24 - 150 - 64 - 58) / 5 - SEPARACION_TARJETA;
  return Math.round(Math.max(48, Math.min(u(240), estimado)));
}
