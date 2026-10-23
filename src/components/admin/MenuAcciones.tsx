import { Modal, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Texto';

import { Colors, Fonts, Spacing, TarjetaLista } from '@/constants/theme';
import { REJILLA, u } from '@/lib/rejilla';

export type Accion = {
  label: string;
  onPress: () => void;
  /** Destaca en rojo lo que borra o no se puede deshacer. */
  peligrosa?: boolean;
};

/**
 * Panel de acciones sobre un elemento.
 *
 * Es un panel propio y no un `Alert` del sistema porque en Android los
 * diálogos solo admiten tres botones: con más, los demás simplemente no se
 * dibujan — así se perdían "Agregar a todas las comunas" y "Eliminar". Además
 * este sigue la estética del panel, con el título en rojo y las filas
 * separadas.
 */
export function MenuAcciones({
  visible,
  titulo,
  acciones,
  onClose,
}: {
  visible: boolean;
  titulo: string;
  acciones: Accion[];
  onClose: () => void;
}) {
  // Que "Cancelar" no quede debajo de la barra de botones del teléfono.
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} navigationBarTranslucent statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Spacing.five + Math.max(insets.bottom, 48) }]}
          onPress={(e) => e.stopPropagation()}>
          {titulo ? (
            <Text style={styles.titulo} numberOfLines={1}>
              {titulo}
            </Text>
          ) : null}

          {acciones.map((accion, i) => (
            <Pressable
              key={accion.label}
              style={({ pressed }) => [styles.fila, i === 0 && !titulo && styles.primera, pressed && styles.filaPresionada]}
              onPress={() => {
                onClose();
                accion.onPress();
              }}>
              <Text style={[styles.label, accion.peligrosa && styles.labelPeligrosa]}>{accion.label}</Text>
            </Pressable>
          ))}

          <Pressable onPress={onClose} style={styles.cancelar}>
            <Text style={styles.cancelarLabel}>Cancelar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Con la estética del resto del panel: negro con borde, texto light grande
// y centrado, lo peligroso y "Cancelar" en rojo.
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: u(REJILLA.curvatura) * 2,
    borderTopRightRadius: u(REJILLA.curvatura) * 2,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: TarjetaLista.borde,
    paddingHorizontal: u(REJILLA.margenLateral) * 2,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
  },
  titulo: {
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.accent,
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  fila: {
    alignItems: 'center',
    paddingVertical: Spacing.four,
    borderTopWidth: 1,
    borderTopColor: TarjetaLista.borde,
  },
  primera: {
    borderTopWidth: 0,
  },
  filaPresionada: {
    opacity: 0.6,
  },
  label: {
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.text,
  },
  labelPeligrosa: {
    color: Colors.accent,
  },
  cancelar: {
    alignItems: 'center',
    paddingTop: Spacing.four,
  },
  cancelarLabel: {
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.accent,
  },
});
