import { Image } from 'expo-image';
import { useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';

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

/** Ancho de la miniatura de pantalla en la vista previa del panel admin. */
const PREVIA_ANCHO = 190;

/**
 * Vista previa del título para el panel de admin: una miniatura de la
 * pantalla, a la proporción real del teléfono, con el título dentro.
 *
 * Es una maqueta de la pantalla y no el logo suelto porque los dos ajustes
 * que hay que ver —qué tan grande es y a qué altura queda— solo se entienden
 * en relación con la pantalla completa. Con el logo suelto, mover la posición
 * no cambiaba nada a la vista y parecía que el control no hacía nada.
 *
 * La franja gris de abajo representa el banner: es la referencia contra la
 * que se mira si el título quedó muy pegado o muy separado.
 */
export function BrandLogoPreview({
  url,
  anchoPct,
  margenPct,
}: {
  url: string | null;
  anchoPct: number;
  /** Margen superior en % del alto. Si no se pasa, el título va centrado. */
  margenPct?: number;
}) {
  const [proporcion, setProporcion] = useState(PROPORCION);
  const proporcionActual = url ? proporcion : PROPORCION;

  const { width: anchoPantalla, height: altoPantalla } = Dimensions.get('window');
  const previaAlto = Math.round((PREVIA_ANCHO * altoPantalla) / anchoPantalla);

  const ancho = Math.round((PREVIA_ANCHO * anchoPct) / 100);
  const alto = Math.round(ancho / proporcionActual);
  const margen = margenPct === undefined ? undefined : Math.round((previaAlto * margenPct) / 100);

  return (
    <View style={[estilosPrevia.pantalla, { width: PREVIA_ANCHO, height: previaAlto }]}>
      <Image
        source={url ? { uri: url } : logoKheep}
        style={{ width: ancho, height: alto, marginTop: margen }}
        contentFit="contain"
        onLoad={({ source }) => {
          if (url && source?.width && source?.height) setProporcion(source.width / source.height);
        }}
        accessibilityRole="image"
        accessibilityLabel="Vista previa del título"
      />
      {margenPct !== undefined && <View style={estilosPrevia.banner} />}
    </View>
  );
}

const estilosPrevia = StyleSheet.create({
  pantalla: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3A3A3A',
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  banner: {
    width: '85%',
    height: '19%',
    marginTop: 'auto',
    marginBottom: '38%',
    borderRadius: 5,
    backgroundColor: '#2C2C2E',
  },
});
