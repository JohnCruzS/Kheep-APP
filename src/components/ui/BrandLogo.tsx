import { Image } from 'expo-image';
import { ReactNode, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import logoKheep from '../../../assets/images/logo-kheep.png';
import { MedidasLogo, useMarca } from '@/lib/marca';

/**
 * Proporción del logo normal (assets/images/logo-kheep.png, 483×143). Si se
 * reemplaza el archivo por otro diseño hay que actualizar este número: de acá
 * sale el alto a partir del ancho, así que una proporción equivocada lo deja
 * con el alto incorrecto.
 */
const PROPORCION = 483 / 143;

/** Separación entre el título y lo que va debajo, en unidades de la rejilla. */
const SEPARACION_DEBAJO = 8;

/**
 * El título "Kheep" como imagen, no como texto.
 *
 * Tiene dos formas de usarse:
 *  - `BrandLogo` con `height`: el logo suelto, a un alto fijo. Es el de los
 *    encabezados chicos (Perfil, Publicar, Panel Admin), donde acompaña y debe
 *    caber en una barra.
 *  - `TituloPosicionado`: EL título del catálogo, colocado dentro del
 *    perímetro con las tres medidas que fija el admin.
 */
export function BrandLogo({ height = 44 }: { height?: number } = {}) {
  const { url } = useMarca();
  const [proporcion, setProporcion] = useState(PROPORCION);
  const proporcionActual = url ? proporcion : PROPORCION;

  return (
    <Image
      source={url ? { uri: url } : logoKheep}
      style={{ height, width: Math.round(height * proporcionActual) }}
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
 * El título del catálogo, colocado con las medidas del admin (Panel Admin →
 * Título de la app). Ver `src/lib/marca.ts`.
 *
 * Se dibuja posicionado dentro del `View` que lo envuelve, que abarca todo el
 * ancho de la pantalla y el alto del perímetro. Las medidas van en la rejilla
 * del cliente —el ancho de pantalla vale 1000—, así que el título cae en el
 * mismo sitio relativo en cualquier teléfono.
 *
 * `debajo` es lo que acompaña al título —hoy, el nombre de la comuna— y se
 * mueve con él: separarlos haría que al correr el logo el texto quedara
 * suelto en otra parte.
 */
export function TituloPosicionado({
  unidad,
  altoPerimetro,
  medidas,
  url,
  debajo,
  recorteArriba = 0,
  onProporcion,
}: {
  /**
   * Cuánto mide una unidad de la rejilla, en píxeles: el ancho de la pantalla
   * dividido entre 1000. Todas las medidas del título se expresan así, tanto
   * las horizontales como las verticales (ver src/lib/marca.ts).
   */
  unidad: number;
  /**
   * Alto del perímetro en unidades. Si se pasa, el título no puede salirse de
   * él: limitar solo el centro no basta, porque el logo tiene alto propio y
   * con un ancho grande sobresale por abajo y se mete en el banner.
   */
  altoPerimetro?: number;
  medidas: MedidasLogo;
  /** Imagen a dibujar; null = el logo normal de la app. */
  url: string | null;
  debajo?: ReactNode;
  /**
   * La proporción real de la imagen cargada. El editor del panel la necesita
   * para su control de "Alto": el alto no se guarda, sale del ancho y de la
   * forma de la imagen, así el título nunca se deforma.
   */
  onProporcion?: (proporcion: number) => void;
  /**
   * Cuántos píxeles del perímetro quedan por encima de este contenedor (la
   * franja de la barra de estado, que el área segura ya reservó aparte). Las
   * medidas se toman desde el borde físico de la pantalla, así que sin
   * descontarla el título quedaría más abajo de lo configurado.
   */
  recorteArriba?: number;
}) {
  // El alto y el ancho son medidas independientes (documento EDIT APP): la
  // imagen se estira a cada lado por separado, así que `contentFit="fill"`.
  const anchoLogo = Math.round(medidas.ancho * unidad);
  const altoLogo = Math.round(medidas.alto * unidad);

  // Las medidas apuntan al CENTRO del logo; el dibujo necesita su esquina.
  const izquierda = Math.round(medidas.centroX * unidad - anchoLogo / 2);

  let arribaSinRecorte = medidas.centroY * unidad - altoLogo / 2;
  if (altoPerimetro !== undefined) {
    // Entre el borde de arriba del perímetro y el de abajo menos lo que mide
    // el logo: así entra entero, pase lo que pase con las medidas guardadas.
    // `floor`: con `round`, el píxel que se gana al redondear dejaba el logo
    // asomando justo por encima del banner.
    const tope = Math.max(0, Math.floor(altoPerimetro * unidad) - altoLogo);
    arribaSinRecorte = Math.min(tope, Math.max(0, arribaSinRecorte));
  }
  const arriba = Math.max(0, Math.round(arribaSinRecorte - recorteArriba));

  return (
    <>
      <View style={[styles.bloque, { left: izquierda, top: arriba, width: anchoLogo }]}>
        <Image
          source={url ? { uri: url } : logoKheep}
          style={{ width: anchoLogo, height: altoLogo }}
          contentFit="fill"
          onLoad={({ source }) => {
            if (source?.width && source?.height) onProporcion?.(source.width / source.height);
          }}
          accessibilityRole="image"
          accessibilityLabel="Kheep"
        />
      </View>

      {/* Lo que acompaña al título va en su propia capa, a todo el ancho y
          desplazada hasta quedar centrada bajo el logo. Antes vivía dentro del
          bloque del logo y heredaba su ancho: un nombre largo como "Todas las
          comunas" se partía en dos líneas y se metía en el banner. */}
      {debajo !== undefined && (
        <View
          style={[
            styles.acompanamiento,
            {
              top: arriba + altoLogo + Math.round(SEPARACION_DEBAJO * unidad),
              transform: [{ translateX: Math.round((medidas.centroX - 500) * unidad) }],
            },
          ]}>
          {debajo}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bloque: {
    position: 'absolute',
    alignItems: 'center',
  },
  acompanamiento: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
