import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useCampoVisible } from '@/components/ui/FormScroll';

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
  onFocus,
  onBlur,
  ...inputProps
}: TextFieldProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const isPasswordField = secureTextEntry === true;

  // El formulario que contiene este campo necesita saber cuál tiene el foco
  // para desplazarse si el teclado lo tapa (ver FormScroll). Fuera de un
  // formulario no pasa nada: el contexto trae funciones vacías.
  const inputRef = useRef<TextInput>(null);
  const { registrarCampo, soltarCampo } = useCampoVisible();

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          placeholder={label}
          placeholderTextColor={Colors.placeholder}
          style={[styles.input, style]}
          secureTextEntry={isPasswordField && !isPasswordVisible}
          onFocus={(e) => {
            registrarCampo(inputRef.current);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            soltarCampo(inputRef.current);
            onBlur?.(e);
          }}
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
