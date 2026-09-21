import { createContext, useContext } from 'react';

/**
 * Marca el contenido que vive dentro de la tarjeta blanca del acceso
 * (Login / Registro / Recuperar contraseña).
 *
 * El resto de la app va sobre negro y sus campos son cápsulas de borde
 * blanco; ahí adentro, en cambio, el fondo es blanco y los campos son una
 * línea, como en los mockups del acceso. En vez de duplicar `TextField` y
 * `Button`, cada uno mira esta bandera y se dibuja como corresponde.
 */
const TarjetaClaraContext = createContext(false);

export const TarjetaClaraProvider = TarjetaClaraContext.Provider;

export function useTarjetaClara(): boolean {
  return useContext(TarjetaClaraContext);
}
