import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import {
  CopiaSeguridad,
  crearCopiaSeguridad,
  eliminarCopiaSeguridad,
  fetchCopiasSeguridad,
  restaurarCopiaSeguridad,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';

/** "20/10/2026 14:05". */
function fechaHora(iso: string): string {
  const d = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/**
 * Copias de seguridad de la configuración (pedido del cliente; 0046), en
 * Panel → Datos: "Guardar copia" guarda cómo está la app ahora (las
 * categorías de cada comuna, qué comunas se ven y los precios de los
 * banners), y cada copia se puede restaurar para volver a esa versión. Al
 * restaurar se guarda antes, sola, una copia "Antes de restaurar".
 */
export function CopiasSeguridad() {
  const [copias, setCopias] = useState<CopiaSeguridad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setCopias(await fetchCopiasSeguridad());
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudieron cargar las copias.'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardar() {
    setOcupado('nueva');
    setAviso(null);
    try {
      // La fecha va debajo del nombre: en el nombre solo se repetía.
      await crearCopiaSeguridad('Copia');
      setAviso('Copia guardada.');
      await cargar();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo guardar la copia.'));
    } finally {
      setOcupado(null);
    }
  }

  function restaurar(copia: CopiaSeguridad) {
    Alert.alert(
      'Volver a esta copia',
      `La configuración vuelve a como estaba el ${fechaHora(copia.created_at)}: las categorías de cada comuna, ` +
        'las comunas visibles y los precios de los banners. Las publicaciones no se tocan. ' +
        'Antes se guarda una copia de cómo está ahora, por si quieres deshacerlo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar',
          style: 'destructive',
          onPress: async () => {
            setOcupado(copia.id);
            setAviso(null);
            try {
              await restaurarCopiaSeguridad(copia.id);
              setAviso(`Listo: la configuración volvió al ${fechaHora(copia.created_at)}.`);
              await cargar();
            } catch (err) {
              setError(getErrorMessage(err, 'No se pudo restaurar la copia.'));
            } finally {
              setOcupado(null);
            }
          },
        },
      ],
    );
  }

  function eliminar(copia: CopiaSeguridad) {
    Alert.alert('Eliminar copia', `Se borra la copia del ${fechaHora(copia.created_at)}.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          setOcupado(copia.id);
          try {
            await eliminarCopiaSeguridad(copia.id);
            await cargar();
          } catch (err) {
            setError(getErrorMessage(err, 'No se pudo eliminar la copia.'));
          } finally {
            setOcupado(null);
          }
        },
      },
    ]);
  }

  return (
    <View>
      <Text style={styles.titulo}>Copias de seguridad</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {aviso ? <Text style={styles.aviso}>{aviso}</Text> : null}

      <Pressable
        style={({ pressed }) => [styles.guardar, pressed && styles.presionado]}
        onPress={guardar}
        disabled={ocupado !== null}
        accessibilityRole="button">
        {ocupado === 'nueva' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.guardarLabel}>Guardar copia</Text>}
      </Pressable>

      {cargando && <ActivityIndicator color={Colors.accent} style={styles.cargando} />}

      {copias.map((copia) => (
        <View key={copia.id} style={styles.fila}>
          <View style={styles.filaTexto}>
            <Text style={styles.nombre} numberOfLines={1}>
              {copia.nombre}
            </Text>
            <Text style={styles.fecha}>{fechaHora(copia.created_at)}</Text>
          </View>
          {ocupado === copia.id ? (
            <ActivityIndicator color={Colors.accent} />
          ) : (
            <>
              <Pressable onPress={() => restaurar(copia)} disabled={ocupado !== null} hitSlop={8} accessibilityRole="button">
                <Text style={styles.restaurar}>Restaurar</Text>
              </Pressable>
              <Pressable onPress={() => eliminar(copia)} disabled={ocupado !== null} hitSlop={8} accessibilityRole="button">
                <Text style={styles.eliminar}>Eliminar</Text>
              </Pressable>
            </>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  titulo: {
    fontFamily: Fonts.light,
    fontSize: 21,
    color: Colors.accent,
    marginBottom: Spacing.two,
  },
  error: {
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.danger,
    marginBottom: Spacing.two,
  },
  aviso: {
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.success,
    marginBottom: Spacing.two,
  },
  guardar: {
    paddingVertical: Spacing.three,
    borderRadius: 18,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  presionado: {
    opacity: 0.8,
  },
  guardarLabel: {
    fontFamily: Fonts.medium,
    fontSize: 18,
    color: '#FFFFFF',
  },
  cargando: {
    marginVertical: Spacing.three,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  filaTexto: {
    flex: 1,
  },
  nombre: {
    fontFamily: Fonts.light,
    fontSize: 15,
    color: Colors.text,
  },
  fecha: {
    fontFamily: Fonts.light,
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  restaurar: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.text,
  },
  eliminar: {
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.danger,
  },
});
