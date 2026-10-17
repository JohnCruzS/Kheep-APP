import { Modal, Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing } from '@/constants/theme';

/**
 * Aviso de que un cambio se guardó (maqueta del cliente): la pantalla se
 * oscurece y al centro va "Cambio realizado!" en rojo y "OK" en blanco, sin
 * recuadro. Se cierra con "OK" o tocando en cualquier parte.
 */
export function AvisoCambio({
  visible,
  texto = 'Cambio realizado!',
  onCerrar,
}: {
  visible: boolean;
  texto?: string;
  onCerrar: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar} accessibilityRole="button">
        <Text style={styles.texto}>{texto}</Text>
        <Pressable onPress={onCerrar} hitSlop={20} accessibilityRole="button">
          <Text style={styles.ok}>OK</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  texto: {
    fontFamily: Fonts.medium,
    fontSize: 26,
    color: Colors.accent,
    textAlign: 'center',
  },
  ok: {
    fontFamily: Fonts.medium,
    fontSize: 24,
    color: '#FFFFFF',
  },
});
