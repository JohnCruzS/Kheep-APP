import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { BotonPie } from '@/components/ui/BotonPie';
import { CampoClave } from '@/components/ui/CampoClave';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { getErrorMessage } from '@/lib/errors';
import { REJILLA, u } from '@/lib/rejilla';

/**
 * Editor de un solo dato a pantalla completa, con el mismo diseño que el de
 * las categorías (pedido del cliente): el título de la app con lo que se
 * edita debajo ("Correo", "Contraseña"), un único campo en cápsula al centro
 * —sin texto de ejemplo, con el cursor al centro— y, abajo, "Guardar" en rojo
 * y "Cancelar" en texto rojo.
 *
 * Arranca con el dato de ahora (`inicial`) para editarlo; la contraseña, que
 * no se puede mostrar, arranca vacía.
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
          {/* El campo, en cápsula y centrado en el espacio libre. El espacio
              como texto de ejemplo deja el cursor al centro (Android lo
              pondría al final). */}
          <View style={styles.centro}>
            <View style={styles.capsula}>
              {esClave ? (
                <CampoClave
                  placeholder=" "
                  value={valor}
                  onChangeText={setValor}
                  style={styles.campo}
                  autoFocus
                  accessibilityLabel={placeholder}
                />
              ) : (
                <TextInput
                  placeholder=" "
                  value={valor}
                  onChangeText={setValor}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.campo}
                  autoFocus
                  accessibilityLabel={placeholder}
                  {...propsCampo}
                />
              )}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>

          <BotonPie
            label={guardando ? 'Guardando…' : 'Guardar'}
            onPress={guardar}
            cargando={guardando}
            debajo={{ texto: 'Cancelar', onPress: onCerrar }}
          />
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
  },
  centro: {
    flex: 1,
    marginHorizontal: u(REJILLA.margenLateral),
    justifyContent: 'center',
  },
  // La cápsula del editor de categorías: borde blanco, bien redondeada.
  capsula: {
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: Spacing.four,
    height: 66,
  },
  campo: {
    fontFamily: Fonts.light,
    fontSize: 19,
    color: Colors.text,
    textAlign: 'center',
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
