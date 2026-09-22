import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import {
  CategoriaDeComuna,
  actualizarCategoria,
  crearCategoriaEnComuna,
  crearCategoriaEnTodasLasComunas,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { REJILLA, u } from '@/lib/rejilla';

/**
 * Crear o editar una categoría, como el documento EDIT APP: pantalla negra,
 * un solo campo en cápsula al centro y, abajo, "Comuna/Todo" con el botón
 * rojo de guardar. Al editar aparece además "Eliminar" en rojo.
 *
 * Las categorías ya no llevan icono (el círculo de la tarjeta del catálogo
 * es la foto del comercio, no un icono), así que el único dato es el nombre.
 *
 * Qué hace "Comuna/Todo":
 *  - Al crear, dónde nace la categoría: solo en esta comuna o en todas.
 *  - Al editar, hasta dónde llega "Eliminar". El nombre es de la categoría y
 *    se ve igual en todas partes, así que para él ese interruptor no tendría
 *    sentido.
 */
export function EditorCategoria({
  categoria,
  crear,
  comunaId,
  nombreComuna,
  onClose,
  onSaved,
  onEliminar,
  soloEstaComuna = false,
}: {
  /** La categoría a editar, o null si se está creando. */
  categoria: CategoriaDeComuna | null;
  crear: boolean;
  comunaId: string;
  nombreComuna: string;
  onClose: () => void;
  onSaved: () => void;
  /** Eliminar; `todas` dice si se quita de toda la app o solo de esta comuna. */
  onEliminar?: (categoria: CategoriaDeComuna, todas: boolean) => void;
  /**
   * Para un administrador de zona: todo queda en esta comuna, así que no se
   * ofrece "Comuna/Todo".
   */
  soloEstaComuna?: boolean;
}) {
  const visible = crear || categoria !== null;

  const [nombre, setNombre] = useState('');
  const [enTodas, setEnTodas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setNombre(categoria?.nombre ?? '');
    setEnTodas(false);
    setError(null);
  }, [visible, categoria]);

  async function handleGuardar() {
    const limpio = nombre.trim();
    if (limpio.length === 0) return setError('Ponle un nombre a la categoría.');

    setGuardando(true);
    setError(null);
    try {
      const datos = { nombre: limpio, icono: null };
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
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.pantalla} edges={['top', 'bottom']}>
        <EncabezadoMarca subtitulo={categoria ? 'Editar categoría' : 'Nueva categoría'} onVolver={onClose} />

        <KeyboardAvoidingView style={styles.cuerpo} behavior="padding">
          <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
            {/* Un solo campo: el nombre. Las categorías ya no llevan icono. */}
            <View style={styles.capsula}>
              <TextInput
                placeholder="Nombre (ej: Delivery)"
                placeholderTextColor={Colors.placeholder}
                value={nombre}
                onChangeText={setNombre}
                style={styles.nombre}
                autoFocus
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {categoria && onEliminar && (
              <Pressable style={styles.eliminar} onPress={() => onEliminar(categoria, enTodas)} hitSlop={10}>
                <Text style={styles.eliminarLabel}>Eliminar</Text>
              </Pressable>
            )}
          </ScrollView>

          <View style={styles.pie}>
            {!soloEstaComuna && (
            <View style={styles.switchFila}>
              <View style={styles.switchTexto}>
                <Text style={styles.switchLabel}>Comuna/Todo</Text>
                <Text style={styles.switchHint}>
                  {categoria
                    ? enTodas
                      ? 'Eliminar la quita de todas las comunas.'
                      : `Eliminar la quita solo de ${nombreComuna}.`
                    : enTodas
                      ? 'Se creará en todas las comunas.'
                      : `Se creará solo en ${nombreComuna}.`}
                </Text>
              </View>
              <Switch
                value={enTodas}
                onValueChange={setEnTodas}
                trackColor={{ false: Colors.surfaceBorder, true: Colors.accent }}
                thumbColor="#FFFFFF"
              />
            </View>
            )}

            <Button label={guardando ? 'Guardando…' : 'Guardar'} onPress={handleGuardar} loading={guardando} />
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
  },
  contenido: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: u(REJILLA.margenLateral),
  },
  capsula: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: Spacing.four,
    height: 66,
  },
  nombre: {
    flex: 1,
    fontFamily: Fonts.light,
    fontSize: 19,
    color: Colors.text,
  },
  error: {
    fontFamily: Fonts.light,
    marginTop: Spacing.three,
    marginLeft: Spacing.four,
    fontSize: 13,
    color: Colors.danger,
  },
  eliminar: {
    marginTop: Spacing.six,
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  eliminarLabel: {
    fontFamily: Fonts.medium,
    fontSize: 21,
    color: Colors.danger,
  },
  pie: {
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingBottom: Spacing.three,
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
    fontSize: 21,
    color: Colors.text,
  },
  switchHint: {
    fontFamily: Fonts.light,
    fontSize: 12.5,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
