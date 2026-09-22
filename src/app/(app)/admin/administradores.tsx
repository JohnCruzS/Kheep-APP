import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { AdminZona, PERMISOS_ZONA, listarAdminsZona } from '@/lib/administradores';
import { getErrorMessage } from '@/lib/errors';
import { REJILLA, u } from '@/lib/rejilla';

/** "Región de Los Lagos" → "Los Lagos": en una lista corta se lee mejor. */
function sinPrefijo(region: string): string {
  return region.replace(/^Regi[oó]n (de |del |de la )?/i, '');
}

/**
 * Los administradores de zona: cuentas que administran solo algunas comunas o
 * regiones, con los permisos que el administrador general les dio.
 *
 * Solo la ve el administrador general (se llega desde su panel).
 */
export default function AdministradoresScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [lista, setLista] = useState<AdminZona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLista(await listarAdminsZona());
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudieron cargar los administradores.'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Al volver de crear o editar uno, la lista se actualiza.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <EncabezadoMarca subtitulo="Administradores" onVolver={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && lista.length === 0 && (
          <Text style={styles.vacio}>
            Todavía no hay administradores de zona. Crea uno con “Nuevo” y asígnale sus comunas o regiones.
          </Text>
        )}

        {lista.map((admin) => {
          const alcance = [
            ...admin.regiones.map(sinPrefijo),
            admin.comunas.length > 0 ? `${admin.comunas.length} ${admin.comunas.length === 1 ? 'comuna' : 'comunas'}` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <Pressable
              key={admin.usuarioId}
              style={({ pressed }) => [styles.fila, pressed && styles.filaPresionada]}
              onPress={() => router.push({ pathname: '/(app)/admin/administrador', params: { id: admin.usuarioId } })}>
              <Text style={styles.nombre} numberOfLines={1}>
                {admin.nombre}
              </Text>
              <Text style={styles.correo} numberOfLines={1}>
                {admin.email}
              </Text>
              <Text style={styles.alcance} numberOfLines={2}>
                {alcance || 'Sin zona asignada'}
              </Text>
              <View style={styles.permisos}>
                {PERMISOS_ZONA.filter((p) => admin.permisos.includes(p.clave)).map((p) => (
                  <Text key={p.clave} style={styles.permiso}>
                    {p.nombre}
                  </Text>
                ))}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        style={({ pressed }) => [styles.nuevo, { marginBottom: Spacing.three + insets.bottom }, pressed && styles.nuevoPresionado]}
        onPress={() => router.push('/(app)/admin/administrador')}>
        <Text style={styles.nuevoLabel}>Nuevo</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingBottom: Spacing.four,
  },
  vacio: {
    fontFamily: Fonts.light,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.five,
    paddingHorizontal: Spacing.four,
  },
  fila: {
    backgroundColor: Colors.surface,
    borderRadius: u(REJILLA.curvatura),
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
  filaPresionada: {
    backgroundColor: Colors.backgroundAlt,
  },
  nombre: {
    fontFamily: Fonts.medium,
    fontSize: 18,
    color: Colors.text,
  },
  correo: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  alcance: {
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.accent,
    marginTop: Spacing.two,
  },
  permisos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  permiso: {
    fontFamily: Fonts.light,
    fontSize: 12,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  nuevo: {
    marginHorizontal: u(REJILLA.margenLateral),
    paddingVertical: Spacing.four,
    borderRadius: u(REJILLA.curvatura),
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  nuevoPresionado: {
    backgroundColor: Colors.accentPressed,
  },
  nuevoLabel: {
    fontFamily: Fonts.medium,
    fontSize: 21,
    color: '#FFFFFF',
  },
});
