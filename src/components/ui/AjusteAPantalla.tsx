import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * En lugar de un ScrollView: si el contenido no cabe en el espacio que le
 * queda, se achica todo por igual lo justo para que quepa, sin deslizar
 * (pedido del cliente, como el panel del admin). Si cabe, se ve tal cual.
 *
 * Para que, achicado, siga ocupando todo el ancho, el contenido se arma más
 * ancho (ancho ÷ escala) y después se escala, pegado arriba.
 */
export function AjusteAPantalla({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [caja, setCaja] = useState({ ancho: 0, alto: 0 });
  const [altoContenido, setAltoContenido] = useState(0);
  const [escala, setEscala] = useState(1);

  // El alto del contenido se mide al ancho de la escala actual: con unas
  // pocas vueltas la escala queda fija (más ancho → más bajo).
  useEffect(() => {
    if (!caja.alto || !altoContenido) return;
    const nueva = Math.min(1, caja.alto / altoContenido);
    if (Math.abs(nueva - escala) > 0.005) setEscala(nueva);
  }, [caja.alto, altoContenido, escala]);

  const anchoInterno = caja.ancho ? caja.ancho / escala : undefined;

  return (
    <View
      style={styles.caja}
      onLayout={(e) => setCaja({ ancho: e.nativeEvent.layout.width, alto: e.nativeEvent.layout.height })}>
      <View
        style={[
          styles.contenido,
          anchoInterno !== undefined && {
            width: anchoInterno,
            left: (caja.ancho - anchoInterno) / 2,
            // Se escala desde el centro; el desplazamiento lo sube para que
            // quede pegado arriba (transformOrigin no se respeta en Android).
            transform: [{ translateY: (-altoContenido * (1 - escala)) / 2 }, { scale: escala }],
          },
          style,
        ]}
        onLayout={(e) => setAltoContenido(e.nativeEvent.layout.height)}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: {
    flex: 1,
    overflow: 'hidden',
  },
  contenido: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
