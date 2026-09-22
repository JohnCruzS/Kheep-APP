import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { suspenderCuenta } from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { REJILLA, u } from '@/lib/rejilla';

/** Cuánto dura la suspensión. null = hasta que alguien la levante. */
const DURACIONES: { dias: number | null; label: string }[] = [
  { dias: 7, label: '7 días' },
  { dias: 30, label: '30 días' },
  { dias: null, label: 'Indefinida' },
];

/**
 * Suspender una cuenta: el motivo es obligatorio (queda anotado y lo ve quien
 * la reactive después) y se elige cuánto dura.
 *
 * Pantalla completa, como el resto de los formularios del panel.
 */
export function SuspenderCuenta({
  visible,
  perfilId,
  nombre,
  onClose,
  onSuspendida,
}: {
  visible: boolean;
  perfilId: string;
  nombre: string;
  onClose: () => void;
  onSuspendida: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [dias, setDias] = useState<number | null>(7);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMotivo('');
    setDias(7);
    setError(null);
  }, [visible]);

  async function handleSuspender() {
    if (motivo.trim().length === 0) return setError('Escribe el motivo de la suspensión.');
    setGuardando(true);
    setError(null);
    try {
      await suspenderCuenta(perfilId, motivo, dias);
      onSuspendida();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo suspender la cuenta.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.pantalla} edges={['top', 'bottom']}>
        <EncabezadoMarca subtitulo="Suspender cuenta" onVolver={onClose} />

        <KeyboardAvoidingView style={styles.pantalla} behavior="padding">
          <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
            <Text style={styles.quien}>{nombre}</Text>
            <Text style={styles.explica}>
              Mientras dure, no podrá iniciar sesión, sus publicaciones no se verán en el catálogo y no podrá crear ni
              editar nada. Su cuenta y sus datos no se borran.
            </Text>

            <Text style={styles.titulo}>Motivo</Text>
            <TextInput
              value={motivo}
              onChangeText={setMotivo}
              placeholder="Ej: publicaciones engañosas"
              placeholderTextColor={Colors.placeholder}
              style={styles.motivo}
              multiline
              maxLength={200}
            />

            <Text style={styles.titulo}>Duración</Text>
            <View style={styles.duraciones}>
              {DURACIONES.map((d) => {
                const elegida = dias === d.dias;
                return (
                  <Pressable
                    key={d.label}
                    onPress={() => setDias(d.dias)}
                    style={[styles.duracion, elegida && styles.duracionElegida]}>
                    <Text style={[styles.duracionLabel, elegida && styles.duracionLabelElegida]}>{d.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.nota}>
              {dias ? `Vuelve a estar activa sola en ${dias} días.` : 'Queda suspendida hasta que alguien la reactive.'}
            </Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.pie}>
            <Button label={guardando ? 'Suspendiendo…' : 'Suspender'} onPress={handleSuspender} loading={guardando} />
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
  contenido: {
    paddingHorizontal: u(REJILLA.margenLateral) + Spacing.two,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
  },
  quien: {
    fontFamily: Fonts.medium,
    fontSize: 21,
    color: Colors.text,
    textAlign: 'center',
  },
  explica: {
    fontFamily: Fonts.light,
    fontSize: 13.5,
    lineHeight: 19,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  titulo: {
    fontFamily: Fonts.light,
    fontSize: 19,
    color: Colors.accent,
    marginTop: Spacing.five,
    marginBottom: Spacing.two,
  },
  motivo: {
    fontFamily: Fonts.light,
    minHeight: 96,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    fontSize: 17,
    color: Colors.text,
    textAlignVertical: 'top',
  },
  duraciones: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  duracion: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  duracionElegida: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  duracionLabel: {
    fontFamily: Fonts.light,
    fontSize: 16,
    color: Colors.text,
  },
  duracionLabelElegida: {
    fontFamily: Fonts.medium,
    color: '#FFFFFF',
  },
  nota: {
    fontFamily: Fonts.light,
    fontSize: 12.5,
    color: Colors.textMuted,
    marginTop: Spacing.two,
  },
  error: {
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.danger,
    marginTop: Spacing.three,
  },
  pie: {
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingBottom: Spacing.three,
  },
});
