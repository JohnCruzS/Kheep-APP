import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { CampoClave } from '@/components/ui/CampoClave';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { getErrorMessage } from '@/lib/errors';
import { REJILLA, u } from '@/lib/rejilla';

/**
 * Editor de un solo dato a pantalla completa (maqueta del cliente): el título
 * de la app con lo que se edita debajo ("Correo", "Contraseña"), un único
 * campo al centro y, abajo, "Guardar" en rojo y "Cancelar" en texto rojo.
 */
export function EditorPantalla({
  visible,
  subtitulo,
  placeholder,
  inicial = '',
  propsCampo,
  esClave,
  validar,
  onCerrar,
  onGuardar,
}: {
  visible: boolean;
  /** Lo que va bajo el título: "Correo", "Contraseña". */
  subtitulo: string;
  placeholder: string;
  /** Con lo que arranca escrito el campo. */
  inicial?: string;
  propsCampo?: TextInputProps;
  /** Campo de contraseña: con el ojo para ver lo que se escribe. */
  esClave?: boolean;
  /** Devuelve el error a mostrar, o null si está bien. */
  validar: (valor: string) => string | null;
  onCerrar: () => void;
  onGuardar: (valor: string) => Promise<void>;
}) {
  const [valor, setValor] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (visible) {
      setValor(inicial);
      setError(null);
    }
  }, [visible, inicial]);

  async function guardar() {
    const problema = validar(valor);
    if (problema) return setError(problema);
    setGuardando(true);
    setError(null);
    try {
      await onGuardar(valor);
      onCerrar();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal visible={visible} animationType="none" onRequestClose={onCerrar}>
      <SafeAreaView style={styles.pantalla} edges={['top', 'bottom']}>
        <EncabezadoMarca subtitulo={subtitulo} />
        <KeyboardAvoidingView style={styles.cuerpo} behavior="padding">
          {/* El campo, centrado en el espacio libre. */}
          <View style={styles.centro}>
            {esClave ? (
              <CampoClave
                placeholder={placeholder}
                placeholderTextColor={Colors.text}
                value={valor}
                onChangeText={setValor}
                style={styles.campo}
              />
            ) : (
              <TextInput
                placeholder={placeholder}
                placeholderTextColor={Colors.text}
                value={valor}
                onChangeText={setValor}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.campo}
                {...propsCampo}
              />
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>

          <View style={styles.abajo}>
            <Button label={guardando ? 'Guardando…' : 'Guardar'} onPress={guardar} loading={guardando} />
            <Pressable onPress={onCerrar} style={styles.cancelar} hitSlop={10} accessibilityRole="button">
              <Text style={styles.cancelarTexto}>Cancelar</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  cuerpo: {
    flex: 1,
    paddingHorizontal: u(REJILLA.margenLateral),
  },
  centro: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  campo: {
    fontFamily: Fonts.delgada,
    fontSize: 20,
    color: Colors.text,
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    paddingVertical: Spacing.three,
  },
  error: {
    fontFamily: Fonts.delgada,
    fontSize: 14,
    color: Colors.danger,
    textAlign: 'center',
    marginTop: Spacing.three,
  },
  abajo: {
    paddingBottom: Spacing.three,
  },
  cancelar: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  // "Cancelar" en Poppins Light rojo, como "Salir" y "Nuevo".
  cancelarTexto: {
    fontFamily: Fonts.delgada,
    fontSize: 25,
    color: Colors.accent,
  },
});
