import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { fetchPublicacionesPendientes } from '@/lib/catalog';
import { REJILLA, u } from '@/lib/rejilla';
import { supabase } from '@/lib/supabase';

/**
 * La pestaña de administración general: lo que no depende de una comuna
 * concreta — el título de la app, aprobar publicaciones, los banners y las
 * métricas. Lo que sí depende de la comuna (categorías y perfiles) vive en la
 * pestaña de Comunas.
 *
 * Es una lista de tarjetas grandes con el nombre en rojo, sin iconos ni
 * descripciones: son cuatro destinos y el nombre basta, así se toca sin
 * apuntar. Debajo, en gris, lo secundario: limpieza, la propia cuenta y
 * cerrar sesión.
 */
export function PanelGeneral() {
  const router = useRouter();
  const [pendientes, setPendientes] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let activo = true;
      fetchPublicacionesPendientes()
        .then((lista) => activo && setPendientes(lista.length))
        .catch(() => activo && setPendientes(null));
      return () => {
        activo = false;
      };
    }, []),
  );

  function confirmarCierre() {
    Alert.alert('Cerrar sesión', '¿Quieres salir de la cuenta de administrador?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/(app)/(tabs)/dashboard');
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <EncabezadoMarca subtitulo="Admin" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Opcion label="Título" onPress={() => router.push('/(app)/admin/logos')} />
        <Opcion
          label="Aprobar"
          // Las pendientes son lo único que "se acumula": el número evita
          // tener que entrar a comprobar si hay algo esperando.
          insignia={pendientes && pendientes > 0 ? pendientes : undefined}
          onPress={() => router.push('/(app)/admin/moderacion')}
        />
        <Opcion label="Banners" onPress={() => router.push('/(app)/admin/banners')} />
        <Opcion label="Métricas" onPress={() => router.push('/(app)/admin/metricas')} />

        <Opcion label="Limpieza" tenue onPress={() => router.push('/(app)/admin/limpieza')} />

        {/* La cuenta del propio admin: al pasar esta pestaña a ser el panel,
            "Editar perfil" y "Cerrar sesión" se quedaban sin ningún camino. */}
        <Opcion label="Mi cuenta" tenue onPress={() => router.push('/(app)/perfil/cuenta')} />

        {/* A la vista, no escondido dentro de "Mi cuenta": el admin comparte
            teléfono o entra desde otro y tiene que poder salir sin buscar. */}
        <Opcion label="Cerrar sesión" tenue onPress={confirmarCierre} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Opcion({
  label,
  insignia,
  tenue,
  onPress,
}: {
  label: string;
  insignia?: number;
  /** Para lo secundario, que no compita con las cuatro opciones de trabajo. */
  tenue?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.tarjeta, pressed && styles.tarjetaPresionada]} onPress={onPress}>
      <Text style={[styles.label, tenue && styles.labelTenue]}>{label}</Text>
      {insignia !== undefined && (
        <View style={styles.insignia}>
          <Text style={styles.insigniaLabel}>{insignia}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingBottom: Spacing.six,
  },
  tarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: u(REJILLA.curvatura),
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
    marginBottom: Spacing.two,
  },
  tarjetaPresionada: {
    backgroundColor: Colors.backgroundAlt,
  },
  label: {
    fontFamily: Fonts.light,
    flex: 1,
    fontSize: 25,
    color: Colors.accent,
  },
  labelTenue: {
    fontSize: 21,
    color: Colors.textMuted,
  },
  insignia: {
    backgroundColor: Colors.accent,
    borderRadius: 20,
    minWidth: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  insigniaLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 12.5,
    color: '#FFFFFF',
  },
});
