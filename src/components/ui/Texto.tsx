import { Children, ReactNode, forwardRef, isValidElement } from 'react';
import { Text as TextoNativo, TextProps } from 'react-native';

/**
 * Tipografía de la app (pedido del cliente):
 *
 *  - Las letras, en Poppins Light (ver `Fonts` en constants/theme).
 *  - Los números, en Arial. Android no trae Arial, así que se usa Arimo, que
 *    es su equivalente libre: mismas medidas letra por letra y el mismo
 *    dibujo, hecha justamente para reemplazarla sin que se note.
 *  - La barra "/" (la de "1/5", "3/5", "0/22"...), en Montserrat Medium.
 *
 * En React Native un mismo texto no puede tener dos fuentes salvo que se
 * parta en pedazos anidados. Este componente hace eso solo: recorre el
 * texto, corta los tramos de números y las barras, y a cada tramo le pone su
 * fuente. El resto del estilo (color, tamaño, alineación, líneas máximas) se
 * hereda del texto de afuera, así que se usa igual que el `Text` de siempre.
 */
export const FUENTE_NUMEROS = 'Arimo_400Regular';
export const FUENTE_BARRA = 'Montserrat_500Medium';

const TRAMOS = /(\d+|\/)/;

function partir(texto: string, clave: string): ReactNode[] {
  return texto
    .split(TRAMOS)
    .filter((tramo) => tramo.length > 0)
    .map((tramo, i) => {
      if (tramo === '/') {
        return (
          <TextoNativo key={`${clave}-${i}`} style={{ fontFamily: FUENTE_BARRA }}>
            {tramo}
          </TextoNativo>
        );
      }
      if (/^\d+$/.test(tramo)) {
        return (
          <TextoNativo key={`${clave}-${i}`} style={{ fontFamily: FUENTE_NUMEROS }}>
            {tramo}
          </TextoNativo>
        );
      }
      return tramo;
    });
}

function transformar(children: ReactNode): ReactNode {
  // Sin números ni barras no hay nada que partir: se devuelve tal cual.
  if (typeof children === 'string') {
    return TRAMOS.test(children) ? partir(children, 't') : children;
  }
  if (typeof children === 'number') {
    return partir(String(children), 'n');
  }
  if (!Array.isArray(children)) return children;

  return Children.toArray(children).flatMap((hijo, i) => {
    if (typeof hijo === 'string') return TRAMOS.test(hijo) ? partir(hijo, `h${i}`) : [hijo];
    if (typeof hijo === 'number') return partir(String(hijo), `h${i}`);
    // Los textos anidados (otro <Text>) se encargan de sí mismos.
    return isValidElement(hijo) ? [hijo] : [hijo];
  });
}

export const Text = forwardRef<TextoNativo, TextProps>(function Text({ children, ...props }, ref) {
  return (
    <TextoNativo ref={ref} {...props}>
      {transformar(children)}
    </TextoNativo>
  );
});
