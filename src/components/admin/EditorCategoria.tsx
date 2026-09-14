import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import {
  CategoriaDeComuna,
  actualizarCategoria,
  crearCategoriaEnComuna,
  crearCategoriaEnTodasLasComunas,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';

/**
 * Crear o editar una categoría: nombre e icono.
 *
 * Al crear se elige si nace solo en esta comuna o en todas. Al editar no
 * aparece esa opción: el nombre y el icono son de la categoría, y cambiarlos
 * la cambia dondequiera que esté — no tendría sentido preguntar dónde.
 */
export function EditorCategoria({
  categoria,
  crear,
  comunaId,
  nombreComuna,
  onClose,
  onSaved,
}: {
  /** La categoría a editar, o null si se está creando. */
  categoria: CategoriaDeComuna | null;
  crear: boolean;
  comunaId: string;
  nombreComuna: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const visible = crear || categoria !== null;

  const [nombre, setNombre] = useState('');
  const [icono, setIcono] = useState('');
  const [enTodas, setEnTodas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setNombre(categoria?.nombre ?? '');
    setIcono(categoria?.icono ?? '');
    setEnTodas(false);
    setError(null);
  }, [visible, categoria]);

  async function handleGuardar() {
    const limpio = nombre.trim();
    if (limpio.length === 0) return setError('Ponle un nombre a la categoría.');

    setGuardando(true);
    setError(null);
    try {
      const datos = { nombre: limpio, icono: icono.trim() || null };
      if (categoria) await actualizarCategoria(categoria.id, datos);
      else if (enTodas) await crearCategoriaEnTodasLasComunas(datos);
      else await crearCategoriaEnComuna(comunaId, datos);
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo guardar la categoría.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Sube el panel por encima del teclado: si no, el campo del nombre
            queda tapado y no se ve lo que se escribe. */}
        <KeyboardAvoidingView behavior="padding">
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.titulo}>{categoria ? 'Editar categoría' : 'Nueva categoría'}</Text>

            <View style={styles.fila}>
              <TextInput
                placeholder="Icono"
                placeholderTextColor={Colors.placeholder}
                value={icono}
                onChangeText={setIcono}
                style={[styles.input, styles.inputIcono]}
                maxLength={4}
              />
              <TextInput
                placeholder="Nombre (ej: Delivery)"
                placeholderTextColor={Colors.placeholder}
                value={nombre}
                onChangeText={setNombre}
                style={[styles.input, styles.inputNombre]}
                autoFocus
              />
            </View>

            {!categoria && (
              <View style={styles.switchFila}>
                <View style={styles.switchTexto}>
                  <Text style={styles.switchLabel}>En todas las comunas</Text>
                  <Text style={styles.switchHint}>
                    {enTodas ? 'Se verá en todo el país.' : `Se verá solo en ${nombreComuna}.`}
                  </Text>
                </View>
                <Switch
                  value={enTodas}
                  onValueChange={setEnTodas}
                  trackColor={{ false: Colors.inputBorder, true: Colors.accent }}
                  thumbColor="#FFFFFF"
                />
              </View>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button label={guardando ? 'Guardando…' : 'Guardar'} onPress={handleGuardar} loading={guardando} />
            <Pressable onPress={onClose} style={styles.cancelar}>
              <Text style={styles.cancelarLabel}>Cancelar</Text>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
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
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    padding: Spacing.four,
    paddingBottom: Spacing.six,
  },
  titulo: {
    fontFamily: Fonts.semiBold,
    fontSize: 17,
    color: Colors.cardText,
    marginBottom: Spacing.three,
  },
  fila: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  input: {
    fontFamily: Fonts.light,
    borderBottomWidth: 1,
    borderBottomColor: Colors.inputBorder,
    paddingVertical: Spacing.two,
    fontSize: 16,
    color: Colors.cardText,
    marginBottom: Spacing.three,
  },
  inputIcono: {
    width: 70,
    textAlign: 'center',
  },
  inputNombre: {
    flex: 1,
  },
  switchFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  switchTexto: {
    flex: 1,
  },
  switchLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.cardText,
  },
  switchHint: {
    fontFamily: Fonts.light,
    fontSize: 12,
    color: Colors.cardTextMuted,
    marginTop: 2,
  },
  error: {
    fontFamily: Fonts.light,
    marginBottom: Spacing.three,
    fontSize: 13,
    color: Colors.danger,
  },
  cancelar: {
    alignItems: 'center',
    paddingTop: Spacing.three,
  },
  cancelarLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.cardTextMuted,
  },
});
