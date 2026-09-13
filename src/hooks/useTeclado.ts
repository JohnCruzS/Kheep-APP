import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * Cuánto alto ocupa el teclado ahora mismo, en píxeles. 0 si está cerrado.
 *
 * Hace falta preguntárselo al sistema en vez de suponerlo: el teclado no mide
 * lo mismo en un teléfono chico que en uno grande, ni entre teclados (Gboard
 * con barra de sugerencias, SwiftKey, el del sistema), ni en horizontal. Y
 * con la pantalla de borde a borde Android ya no achica la ventana al
 * abrirlo, así que nada de esto se deduce solo del alto de la pantalla.
 *
 * `keyboardDidChangeFrame` además cubre que el teclado cambie de tamaño
 * mientras está abierto — al mostrar sugerencias, o al cambiar a emojis.
 */
export function useAltoTeclado(): number {
  const [alto, setAlto] = useState(0);

  useEffect(() => {
    const eventos = [
      Keyboard.addListener('keyboardDidShow', (e) => setAlto(e.endCoordinates.height)),
      Keyboard.addListener('keyboardDidChangeFrame', (e) => setAlto(e.endCoordinates.height)),
      Keyboard.addListener('keyboardDidHide', () => setAlto(0)),
    ];
    return () => eventos.forEach((evento) => evento.remove());
  }, []);

  return alto;
}
