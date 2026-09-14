import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';

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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.titulo} numberOfLines={1}>
            {titulo}
          </Text>

          {acciones.map((accion) => (
            <Pressable
              key={accion.label}
              style={({ pressed }) => [styles.fila, pressed && styles.filaPresionada]}
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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.backgroundAlt,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
  },
  titulo: {
    fontFamily: Fonts.light,
    fontSize: 19,
    color: Colors.accent,
    marginBottom: Spacing.three,
  },
  fila: {
    paddingVertical: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  filaPresionada: {
    backgroundColor: Colors.surface,
  },
  label: {
    fontFamily: Fonts.light,
    fontSize: 17,
    color: Colors.text,
  },
  labelPeligrosa: {
    color: Colors.danger,
  },
  cancelar: {
    alignItems: 'center',
    paddingTop: Spacing.four,
  },
  cancelarLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.textMuted,
  },
});
