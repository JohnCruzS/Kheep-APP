import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { TituloPosicionado } from '@/components/ui/BrandLogo';
import { Colors, Fonts } from '@/constants/theme';
import { MARGEN_LATERAL, MedidasLogo, PERIMETRO_ALTO } from '@/lib/marca';

/** Ancho de la maqueta en el panel: es la pantalla entera, a escala. */
const ANCHO_MAQUETA = 240;
/**
 * Cuánto de la pantalla se dibuja, en unidades de la rejilla. Con el
 * perímetro en 340, esto llega bastante más abajo del banner y deja ver cómo
 * queda el conjunto, sin gastar media pantalla del panel en las tarjetas del
 * catálogo, que no tienen nada que ver con dónde va el título.
 */
const ALTO_MAQUETA = 900;
/** Alto del banner en la rejilla, para dibujarlo debajo del perímetro. */
const ALTO_BANNER = 310;

export type Guias = {
  centroX: boolean;
  ancho: boolean;
  centroY: boolean;
};

/**
 * Maqueta del catálogo para el panel de admin: cómo va a quedar el título con
 * las medidas que se están probando, antes de guardarlas para todos.
 *
 * Se dibuja a la escala de la rejilla del cliente (el ancho de pantalla vale
 * 1000), con el perímetro marcado —el rectángulo dentro del cual el título se
 * mueve— y el banner debajo, porque la posición del título solo se entiende
 * en relación con ellos.
 *
 * Las líneas punteadas son las guías que el admin enciende para cada medida:
 * la vertical marca el centro horizontal, la horizontal el centro vertical, y
 * el recuadro rojo alrededor del logo marca el ancho que ocupa.
 */
export function VistaPreviaTitulo({
  medidas,
  url,
  guias,
  comuna,
}: {
  medidas: MedidasLogo;
  url: string | null;
  guias: Guias;
  comuna?: string;
}) {
  // La maqueta no depende del teléfono: es la rejilla dibujada a escala.
  const { width: anchoPantalla } = useWindowDimensions();
  const unidad = ANCHO_MAQUETA / 1000;

  const altoMaqueta = Math.round(ALTO_MAQUETA * unidad);
  const altoPerimetro = Math.round(PERIMETRO_ALTO * unidad);
  const margen = Math.round(MARGEN_LATERAL * unidad);

  const centroX = Math.round(medidas.centroX * unidad);
  const centroY = Math.round(medidas.centroY * unidad);
  const anchoLogo = Math.round(medidas.ancho * unidad);

  return (
    <View style={[styles.maqueta, { width: ANCHO_MAQUETA, height: altoMaqueta }]}>
      {/* El perímetro se dibuja siempre, no solo con las guías encendidas: es
          el marco dentro del cual el título se mueve, y sin verlo los números
          no dicen nada. Ocupa el ancho del banner. */}
      <View
        style={[
          styles.perimetro,
          { left: margen, right: margen, height: altoPerimetro },
        ]}
      />

      <TituloPosicionado unidad={unidad} altoPerimetro={PERIMETRO_ALTO} medidas={medidas} url={url} debajo={comuna ? <Text style={styles.comuna}>{comuna}</Text> : undefined} />

      {guias.centroX && <View style={[styles.guiaVertical, { left: centroX, height: altoPerimetro }]} />}
      {guias.centroY && <View style={[styles.guiaHorizontal, { top: centroY, left: margen, right: margen }]} />}
      {guias.ancho && (
        <View
          style={[
            styles.guiaAncho,
            { left: centroX - anchoLogo / 2, width: anchoLogo, height: altoPerimetro },
          ]}
        />
      )}

      {/* El banner: el título se mira siempre contra él, así se ve si quedó
          muy pegado o muy separado. */}
      <View
        style={[
          styles.banner,
          { top: altoPerimetro, left: margen, right: margen, height: Math.round(ALTO_BANNER * unidad) },
        ]}
      />

      {/* Referencia del ancho de la pantalla: da sentido a que el título mida
          "400 de 1000" y no un número suelto. */}
      <Text style={styles.escala}>{`la pantalla completa = 1000  ·  ${Math.round(anchoPantalla)} px`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  maqueta: {
    position: 'relative',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3A3A3A',
    backgroundColor: Colors.background,
    overflow: 'hidden',
  },
  perimetro: {
    position: 'absolute',
    top: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 4,
  },
  comuna: {
    fontFamily: Fonts.light,
    fontSize: 8,
    color: Colors.textMuted,
    marginTop: 1,
  },
  banner: {
    position: 'absolute',
    marginTop: 4,
    borderRadius: 5,
    backgroundColor: '#2C2C2E',
  },
  escala: {
    position: 'absolute',
    bottom: 6,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: Fonts.light,
    fontSize: 9,
    color: Colors.textMuted,
  },
  guiaVertical: {
    position: 'absolute',
    top: 0,
    width: 1,
    borderLeftWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#FFFFFF',
  },
  guiaHorizontal: {
    position: 'absolute',
    height: 1,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#FFFFFF',
  },
  guiaAncho: {
    position: 'absolute',
    top: 0,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.accent,
  },
});
