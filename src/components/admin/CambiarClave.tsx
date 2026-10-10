import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { getErrorMessage } from '@/lib/errors';

/**
 * Ventana para fijar una clave nueva. Las claves se guardan cifradas y nadie
 * puede leerlas —ni siquiera el administrador—, así que en vez de mostrarla
 * se ofrece cambiarla.
 */
export function CambiarClave({
  visible,
  para,
  onCerrar,
  onGuardar,
}: {
  visible: boolean;
  /** De quién es la clave, para el título. */
  para: string;
  onCerrar: () => void;
  onGuardar: (clave: string) => Promise<void>;
}) {
  const [clave, setClave] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (visible) {
      setClave('');
      setRepetida('');
      setError(null);
    }
  }, [visible]);

  async function guardar() {
    if (clave.length < 6) return setError('La clave debe tener al menos 6 caracteres.');
    if (clave !== repetida) return setError('Las dos claves no coinciden.');
    setGuardando(true);
    setError(null);
    try {
      await onGuardar(clave);
      onCerrar();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo cambiar la clave.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <KeyboardAvoidingView behavior="padding">
          <Pressable style={styles.panel} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.titulo}>Cambiar clave</Text>
            <Text style={styles.para}>{para}</Text>

            <TextInput
              placeholder="Clave nueva"
              placeholderTextColor={Colors.placeholder}
              value={clave}
              onChangeText={setClave}
              secureTextEntry
              autoCapitalize="none"
              style={styles.campo}
            />
            <TextInput
              placeholder="Repite la clave"
              placeholderTextColor={Colors.placeholder}
              value={repetida}
              onChangeText={setRepetida}
              secureTextEntry
              autoCapitalize="none"
              style={styles.campo}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button label={guardando ? 'Guardando…' : 'Guardar'} onPress={guardar} loading={guardando} />
            <Pressable onPress={onCerrar} style={styles.cancelar} hitSlop={8}>
              <Text style={styles.cancelarTexto}>Cancelar</Text>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: Colors.backgroundAlt,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    padding: Spacing.four,
    paddingBottom: Spacing.six,
  },
  titulo: {
    fontFamily: Fonts.medium,
    fontSize: 20,
    color: Colors.text,
  },
  para: {
    fontFamily: Fonts.delgada,
    fontSize: 15,
    color: Colors.textMuted,
    marginTop: 2,
    marginBottom: Spacing.three,
  },
  campo: {
    fontFamily: Fonts.delgada,
    fontSize: 17,
    color: Colors.text,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    paddingVertical: Spacing.two,
    marginBottom: Spacing.three,
  },
  error: {
    fontFamily: Fonts.delgada,
    fontSize: 14,
    color: Colors.danger,
    marginBottom: Spacing.two,
  },
  cancelar: {
    alignItems: 'center',
    paddingTop: Spacing.three,
  },
  cancelarTexto: {
    fontFamily: Fonts.medium,
    fontSize: 15,
    color: Colors.textMuted,
  },
});
