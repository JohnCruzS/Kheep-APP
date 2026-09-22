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

/** Tope de la duración a medida: más de un año es, en la práctica, indefinida. */
const DIAS_MAX = 365;

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
  /** "Otra": la persona escribe los días. */
  const [aMedida, setAMedida] = useState(false);
  const [diasLibres, setDiasLibres] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setMotivo('');
    setDias(7);
    setAMedida(false);
    setDiasLibres('');
    setError(null);
  }, [visible]);

  async function handleSuspender() {
    if (motivo.trim().length === 0) return setError('Escribe el motivo de la suspensión.');
    if (aMedida && (!dias || dias < 1)) return setError(`Escribe cuántos días (1 a ${DIAS_MAX}).`);
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
                const elegida = !aMedida && dias === d.dias;
                return (
                  <Pressable
                    key={d.label}
                    onPress={() => {
                      setAMedida(false);
                      setDias(d.dias);
                    }}
                    style={[styles.duracion, elegida && styles.duracionElegida]}>
                    <Text style={[styles.duracionLabel, elegida && styles.duracionLabelElegida]}>{d.label}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => {
                  // Vacío, no con el valor anterior: quien elige "Otra" va a
                  // escribir su número, y arrastrar el viejo lo dejaría pegado
                  // delante (7 + 45 = "745").
                  setAMedida(true);
                  setDiasLibres('');
                  setDias(null);
                }}
                style={[styles.duracion, aMedida && styles.duracionElegida]}>
                <Text style={[styles.duracionLabel, aMedida && styles.duracionLabelElegida]}>Otra</Text>
              </Pressable>
            </View>

            {aMedida && (
              <View style={styles.aMedida}>
                <TextInput
                  value={diasLibres}
                  onChangeText={(texto) => {
                    const numeros = texto.replace(/[^0-9]/g, '').slice(0, 3);
                    // Pasarse del tope recorta el número en el mismo campo: lo
                    // que se ve escrito es siempre lo que se va a aplicar.
                    const limitado = Number(numeros) > DIAS_MAX ? String(DIAS_MAX) : numeros;
                    setDiasLibres(limitado);
                    setDias(Number(limitado) >= 1 ? Number(limitado) : null);
                  }}
                  keyboardType="number-pad"
                  placeholder="Días"
                  placeholderTextColor={Colors.placeholder}
                  style={styles.aMedidaInput}
                  autoFocus
                />
                <Text style={styles.aMedidaHint}>días (1 a {DIAS_MAX})</Text>
              </View>
            )}
            <Text style={styles.nota}>
              {dias
                ? `Vuelve a estar activa sola en ${dias} ${dias === 1 ? 'día' : 'días'}.`
                : aMedida
                  ? 'Escribe cuántos días dura.'
                  : 'Queda suspendida hasta que alguien la reactive.'}
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
  aMedida: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  aMedidaInput: {
    fontFamily: Fonts.light,
    width: 110,
    height: 54,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 999,
    textAlign: 'center',
    fontSize: 18,
    color: Colors.text,
  },
  aMedidaHint: {
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.textMuted,
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
