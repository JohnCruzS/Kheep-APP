import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { Colors, Fonts, Spacing } from '@/constants/theme';

type TextFieldProps = TextInputProps & {
  label: string;
  error?: string;
  /** Texto de ayuda con el formato esperado, se muestra debajo mientras no haya error. */
  hint?: string;
};

export function TextField({
  label,
  error,
  hint,
  secureTextEntry,
  style,
  ...inputProps
}: TextFieldProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const isPasswordField = secureTextEntry === true;

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <TextInput
          placeholder={label}
          placeholderTextColor={Colors.placeholder}
          style={[styles.input, style]}
          secureTextEntry={isPasswordField && !isPasswordVisible}
          {...inputProps}
        />
        {isPasswordField && (
          <Pressable
            onPress={() => setIsPasswordVisible((visible) => !visible)}
            hitSlop={10}
            style={styles.toggle}
            accessibilityRole="button"
            accessibilityLabel={isPasswordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
            <Ionicons
              name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={Colors.cardTextMuted}
            />
          </Pressable>
        )}
      </View>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.four,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.inputBorder,
  },
  input: {
    flex: 1,
    fontFamily: Fonts.light,
    fontSize: 18,
    color: Colors.cardText,
    paddingBottom: Spacing.two,
  },
  toggle: {
    paddingLeft: Spacing.two,
    paddingBottom: Spacing.two,
  },
  error: {
    fontFamily: Fonts.light,
    marginTop: Spacing.one,
    fontSize: 12,
    color: Colors.danger,
  },
  hint: {
    fontFamily: Fonts.light,
    marginTop: Spacing.one,
    fontSize: 12,
    color: Colors.textMuted,
  },
});
