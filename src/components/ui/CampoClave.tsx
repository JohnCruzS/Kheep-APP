import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type TextStyle } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';

/**
 * Campo de contraseña con el ojo para ver lo que se está escribiendo (pedido
 * del cliente: en todos lados donde se escribe una clave). El aspecto del
 * campo lo pone quien lo usa con `style`; el ojo va dentro, a la derecha.
 */
export function CampoClave({ style, ...props }: Omit<TextInputProps, 'secureTextEntry'> & { style?: StyleProp<TextStyle> }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.contenedor}>
      <TextInput
        {...props}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        // Aire a cada lado para que el texto (centrado o no) no quede debajo del
        // ojo; quien lo usa puede cambiarlo con su `style` (va después).
        style={[styles.conOjo, style]}
      />
      <Pressable
        style={styles.ojo}
        onPress={() => setVisible((v) => !v)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={22} color={Colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    justifyContent: 'center',
  },
  conOjo: {
    paddingLeft: Spacing.five,
    paddingRight: Spacing.five,
  },
  ojo: {
    position: 'absolute',
    right: Spacing.one,
  },
});
