import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { REJILLA, u } from '@/lib/rejilla';

/** Alto del botón rojo de abajo. */
const ALTO_BOTON = 72;
/**
 * Espacio debajo del botón: ahí va "Cancelar" cuando lo hay. Se deja siempre,
 * con o sin "Cancelar", para que el botón quede a la misma altura en todas
 * las vistas.
 */
const ALTO_DEBAJO = 56;

/**
 * El botón rojo de abajo de las vistas ("Guardar", "Nuevo", "Nueva",
 * "Publicar", "Listo"…): mismo tamaño y misma altura en todas (pedido del
 * cliente), siempre debajo del contenido, nunca encima. Va como último hijo
 * de una pantalla con el borde inferior seguro (SafeAreaView con 'bottom').
 */
export function BotonPie({
  label,
  onPress,
  cargando,
  apagado,
  aviso,
  debajo,
}: {
  label: string;
  onPress: () => void;
  cargando?: boolean;
  /** Gris y sin responder (por ejemplo, sin cambios que guardar). */
  apagado?: boolean;
  /** Un error, justo encima del botón, sin moverlo. */
  aviso?: string | null;
  /** Texto rojo debajo del botón, como "Cancelar". */
  debajo?: { texto: string; onPress: () => void };
}) {
  return (
    <View style={styles.pie}>
      {aviso ? (
        <Text style={styles.aviso} numberOfLines={3}>
          {aviso}
        </Text>
      ) : null}
      <Pressable
        style={({ pressed }) => [styles.boton, apagado && styles.apagado, pressed && !apagado && styles.presionado]}
        onPress={onPress}
        disabled={apagado || cargando}
        accessibilityRole="button"
        accessibilityLabel={label}>
        {cargando ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit>
            {label}
          </Text>
        )}
      </Pressable>
      <View style={styles.debajo}>
        {debajo ? (
          <Pressable onPress={debajo.onPress} hitSlop={10} accessibilityRole="button">
            <Text style={styles.debajoTexto}>{debajo.texto}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pie: {
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingTop: Spacing.three,
  },
  aviso: {
    position: 'absolute',
    bottom: '100%',
    left: u(REJILLA.margenLateral),
    right: u(REJILLA.margenLateral),
    fontFamily: Fonts.delgada,
    fontSize: 14,
    color: Colors.danger,
    textAlign: 'center',
  },
  boton: {
    height: ALTO_BOTON,
    borderRadius: u(REJILLA.curvatura),
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  apagado: {
    backgroundColor: '#7F7F7F',
  },
  presionado: {
    backgroundColor: Colors.accentPressed,
  },
  label: {
    fontFamily: Fonts.medium,
    fontSize: 30,
    color: '#FFFFFF',
  },
  debajo: {
    height: ALTO_DEBAJO,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // "Cancelar" en Poppins Light rojo, como "Salir".
  debajoTexto: {
    fontFamily: Fonts.delgada,
    fontSize: 25,
    color: Colors.accent,
  },
});
