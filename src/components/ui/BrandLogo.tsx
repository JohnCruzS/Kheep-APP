import { Image } from 'expo-image';
import { useState } from 'react';
import { Dimensions } from 'react-native';

import logoKheep from '../../../assets/images/logo-kheep.png';
import { useMarca } from '@/lib/marca';

/**
 * Proporción del logo normal (assets/images/logo-kheep.png, 483×143). Si se
 * reemplaza el archivo por otro diseño hay que actualizar este número: de acá
 * sale el alto a partir del ancho, así que una proporción equivocada lo deja
 * con el alto incorrecto.
 */
const PROPORCION = 483 / 143;

/**
 * El título "Kheep" como imagen, no como texto. El admin lo administra desde
 * Panel Admin → Logo de la app: puede programar logos especiales por fecha
 * (estilo Google Doodle) y ajustar de qué tamaño se ve el título — y ese
 * tamaño lo ven todos los usuarios, no es una preferencia del teléfono.
 * Ver src/lib/marca.ts y las migraciones 0015 y 0016.
 *
 * Dos formas de pedirlo:
 *  - Sin props: es EL título. Su ancho es el porcentaje de pantalla que el
 *    admin dejó configurado.
 *  - Con `height`: encabezados chicos (Perfil, Publicar, Panel Admin), donde
 *    el logo acompaña y debe caber en una barra de alto fijo. Ahí el ajuste
 *    del admin no aplica, si no rompería esas barras.
 */
export function BrandLogo({ height }: { height?: number } = {}) {
  const { url, anchoPct } = useMarca();

  // Cada logo temático tiene su propia forma (uno más alargado, otro más
  // cuadrado). Se parte suponiendo la del logo normal y se corrige con el
  // tamaño real en cuanto la imagen carga; con `contain` nunca se deforma,
  // en el peor caso se ve un momento dentro de un recuadro más alto.
  const [proporcion, setProporcion] = useState(PROPORCION);
  const proporcionActual = url ? proporcion : PROPORCION;

  const ancho =
    height !== undefined
      ? Math.round(height * proporcionActual)
      : Math.round((Dimensions.get('window').width * anchoPct) / 100);
  const alto = height ?? Math.round(ancho / proporcionActual);

  return (
    <Image
      source={url ? { uri: url } : logoKheep}
      style={{ height: alto, width: ancho }}
      contentFit="contain"
      onLoad={({ source }) => {
        if (url && source?.width && source?.height) setProporcion(source.width / source.height);
      }}
      accessibilityRole="image"
      accessibilityLabel="Kheep"
    />
  );
}

/**
 * El título dibujado con un tamaño dado en vez del configurado. Sirve para la
 * vista previa del panel de admin: mientras se arrastra el tamaño hay que ver
 * el resultado antes de guardarlo para todos.
 */
export function BrandLogoPreview({ url, anchoPct }: { url: string | null; anchoPct: number }) {
  const [proporcion, setProporcion] = useState(PROPORCION);
  const proporcionActual = url ? proporcion : PROPORCION;
  const ancho = Math.round((Dimensions.get('window').width * anchoPct) / 100);

  return (
    <Image
      source={url ? { uri: url } : logoKheep}
      style={{ width: ancho, height: Math.round(ancho / proporcionActual) }}
      contentFit="contain"
      onLoad={({ source }) => {
        if (url && source?.width && source?.height) setProporcion(source.width / source.height);
      }}
      accessibilityRole="image"
      accessibilityLabel="Vista previa del título"
    />
  );
}
