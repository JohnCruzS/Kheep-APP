import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { TituloPosicionado } from '@/components/ui/BrandLogo';
import { Colors, Fonts } from '@/constants/theme';
import { MedidasLogo, PERIMETRO_ALTO } from '@/lib/marca';
import { REJILLA } from '@/lib/rejilla';

export type Guias = {
  /** El centro vertical: dónde queda el medio de la imagen. */
  centro: boolean;
  /** El alto que ocupa la imagen. */
  alto: boolean;
  /** El ancho que ocupa la imagen. */
  ancho: boolean;
};

/**
 * Cómo se va a ver el título en el inicio, al ancho completo de la pantalla y
 * en escala real (documento EDIT APP): lo que se ve acá es exactamente lo que
 * van a ver todos, no una miniatura.
 *
 * Debajo va la silueta del banner, también a su tamaño real. El título solo
 * se entiende en relación con él: es lo que dice si quedó muy pegado o
 * flotando en el vacío.
 *
 * Las guías punteadas son las que el admin enciende en cada medida:
 *  - Centro: una línea horizontal por el medio exacto de la imagen.
 *  - Alto:   dos líneas, arriba y abajo de la imagen.
 *  - Ancho:  dos líneas, a cada costado.
 */
export function VistaPreviaTitulo({
  medidas,
  alto,
  url,
  guias,
  comuna,
  onCambiarImagen,
  onProporcion,
  recorteArriba = 0,
}: {
  medidas: MedidasLogo;
  /** Alto de la imagen en unidades de la rejilla; sale del ancho. */
  alto: number;
  url: string | null;
  guias: Guias;
  comuna?: string;
  /** Tocar la imagen cambia la que está puesta (documento EDIT APP). */
  onCambiarImagen?: () => void;
  onProporcion?: (proporcion: number) => void;
  /**
   * Píxeles de arriba que tapa la barra de estado. La maqueta va desde el
   * borde físico de la pantalla, como el inicio: con esto se recorta esa
   * franja y el título queda exactamente donde lo verán todos.
   */
  recorteArriba?: number;
}) {
  // Escala real: una unidad de la rejilla es el ancho de ESTA pantalla / 1000,
  // igual que en el catálogo.
  const { width: anchoPantalla } = useWindowDimensions();
  const unidad = anchoPantalla / 1000;

  // Perímetro fijo de 340 medido desde el borde de la pantalla; lo que tapa la
  // barra de estado no se dibuja.
  const altoPerimetro = Math.round(PERIMETRO_ALTO * unidad) - recorteArriba;
  const altoBanner = Math.round(REJILLA.bannerAlto * unidad);
  const margen = Math.round(REJILLA.margenLateral * unidad);

  const anchoLogo = Math.round(medidas.ancho * unidad);
  const altoLogo = Math.round(alto * unidad);
  const centro = Math.round(medidas.centroY * unidad) - recorteArriba;
  // El nombre de la comuna, igual que en el inicio (45 de 1000 de ancho).
  const tamanoComuna = Math.min(26, Math.max(14, Math.round((anchoPantalla * 45) / 1000)));
  /** Borde izquierdo de la imagen: va siempre centrada a lo ancho. */
  const bordeIzquierdo = Math.round((anchoPantalla - anchoLogo) / 2);

  return (
    <View style={[styles.maqueta, { width: anchoPantalla, height: altoPerimetro + altoBanner }]}>
      <TituloPosicionado
        unidad={unidad}
        altoPerimetro={PERIMETRO_ALTO}
        recorteArriba={recorteArriba}
        medidas={medidas}
        url={url}
        onProporcion={onProporcion}
        debajo={comuna ? <Text style={[styles.comuna, { fontSize: tamanoComuna, lineHeight: Math.round(tamanoComuna * 1.3) }]}>
              {comuna}
            </Text> : undefined}
      />

      {/* Centro: la horizontal marca dónde queda el medio de la imagen y la
          vertical, el centro de la pantalla contra el que se alinea. */}
      {guias.centro && (
        <>
          <View style={[styles.guiaHorizontal, { top: centro }]} />
          <View
            style={[styles.guiaVertical, { left: Math.round(anchoPantalla / 2), top: 0, height: altoPerimetro }]}
          />
        </>
      )}

      {/* Alto: arriba y abajo de la imagen, y solo del ancho de la imagen. */}
      {guias.alto && (
        <>
          <View
            style={[
              styles.guiaHorizontalCorta,
              { top: Math.max(0, centro - altoLogo / 2), left: bordeIzquierdo, width: anchoLogo },
            ]}
          />
          <View
            style={[
              styles.guiaHorizontalCorta,
              { top: Math.min(altoPerimetro - 1, centro + altoLogo / 2), left: bordeIzquierdo, width: anchoLogo },
            ]}
          />
        </>
      )}

      {/* Ancho: a los costados de la imagen, y solo de su alto. */}
      {guias.ancho && (
        <>
          <View
            style={[styles.guiaVertical, { left: bordeIzquierdo, top: centro - altoLogo / 2, height: altoLogo }]}
          />
          <View
            style={[
              styles.guiaVertical,
              { left: bordeIzquierdo + anchoLogo, top: centro - altoLogo / 2, height: altoLogo },
            ]}
          />
        </>
      )}

      {/* La silueta del banner, en su tamaño real. */}
      <View
        style={[
          styles.banner,
          {
            top: altoPerimetro,
            left: margen,
            right: margen,
            height: altoBanner,
            borderRadius: Math.round(REJILLA.curvatura * unidad),
          },
        ]}
      />

      {/* Toda la franja del título es el área para cambiar la imagen: apuntar
          justo al logo con el dedo, cuando está chico, es imposible. */}
      {onCambiarImagen && (
        <Pressable
          style={[styles.zonaImagen, { height: altoPerimetro }]}
          onPress={onCambiarImagen}
          accessibilityRole="button"
          accessibilityLabel="Cambiar la imagen del título"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  maqueta: {
    position: 'relative',
    backgroundColor: Colors.background,
    overflow: 'hidden',
  },
  comuna: {
    fontFamily: Fonts.light,
    color: '#8A8A8A',
  },
  banner: {
    position: 'absolute',
    // La silueta del banner, casi negra: antes era un gris que competía con
    // el título.
    backgroundColor: '#0D0D0D',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zonaImagen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  guiaVertical: {
    position: 'absolute',
    width: 1,
    borderLeftWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.accent,
  },
  guiaHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#FFFFFF',
  },
  guiaHorizontalCorta: {
    position: 'absolute',
    height: 1,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.accent,
  },
});
