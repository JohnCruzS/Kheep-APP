import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { useTarjetaClara } from '@/components/ui/TarjetaClara';
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
  // Dentro de la tarjeta blanca del acceso el campo es una línea; fuera, una
  // cápsula sobre negro.
  const claro = useTarjetaClara();
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const isPasswordField = secureTextEntry === true;

  // El formulario que contiene este campo necesita saber cuál tiene el foco
  // para desplazarse si el teclado lo tapa (ver FormScroll). Fuera de un
  // formulario no pasa nada: el contexto trae funciones vacías.
  const inputRef = useRef<TextInput>(null);
  const { registrarCampo, soltarCampo } = useCampoVisible();

  return (
    <View style={styles.container}>
      <View style={[styles.inputRow, claro && styles.inputRowClaro]}>
        <TextInput
          ref={inputRef}
          placeholder={label}
          placeholderTextColor={Colors.placeholder}
          style={[styles.input, claro && styles.inputClaro, style]}
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
              color={claro ? Colors.cardTextMuted : Colors.textMuted}
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
  // Cápsula de borde blanco sobre negro, como el documento EDIT APP. Antes
  // era una línea inferior sobre tarjeta blanca.
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: Spacing.four,
    height: 62,
  },
  input: {
    flex: 1,
    fontFamily: Fonts.light,
    fontSize: 18,
    color: Colors.text,
  },
  // Acceso: la línea de siempre sobre la tarjeta blanca.
  inputRowClaro: {
    borderWidth: 0,
    borderBottomWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 0,
    paddingHorizontal: 0,
    height: undefined,
    paddingBottom: Spacing.two,
  },
  inputClaro: {
    color: Colors.cardText,
  },
  toggle: {
    paddingLeft: Spacing.two,
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
