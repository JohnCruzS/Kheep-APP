import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { puede } from '@/lib/administradores';
import { useSession } from '@/providers/SessionProvider';
import { fetchPublicacionesPendientes } from '@/lib/catalog';
import { REJILLA, u } from '@/lib/rejilla';
import { supabase } from '@/lib/supabase';

/**
 * La pestaña de administración general: lo que no depende de una comuna
 * concreta — el título de la app, aprobar publicaciones, los banners y las
 * métricas. Lo que sí depende de la comuna (categorías y perfiles) vive en la
 * pestaña de Comunas.
 *
 * Es una lista de tarjetas negras con borde tenue y el nombre en blanco, sin
 * iconos ni descripciones: los nombres son cortos y bastan para saber a dónde
 * lleva cada una. Al final, "Salir" en rojo y sin tarjeta, porque no es un
 * destino sino una acción. Medidas tomadas de la maqueta del cliente.
 */
export function PanelGeneral() {
  const router = useRouter();
  const { permisos } = useSession();
  // El general ve todo. El de zona, solo las secciones de sus permisos.
  const esGeneral = permisos?.esGeneral ?? false;
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
        {esGeneral && <Opcion label="Título" onPress={() => router.push('/(app)/admin/logos')} />}
        {puede(permisos, 'moderar') && (
        <Opcion
          label="Aprobar"
          // Las pendientes son lo único que "se acumula": el número evita
          // tener que entrar a comprobar si hay algo esperando.
          insignia={pendientes && pendientes > 0 ? pendientes : undefined}
          onPress={() => router.push('/(app)/admin/moderacion')}
        />
        )}
        {puede(permisos, 'banners') && (
          <>
            <Opcion label="Banners" onPress={() => router.push('/(app)/admin/banners')} />
            <Opcion label="Métricas" onPress={() => router.push('/(app)/admin/metricas')} />
          </>
        )}
        {esGeneral && <Opcion label="Admins" onPress={() => router.push('/(app)/admin/administradores')} />}

        {/* "Datos": las imágenes que ya no usa nadie y el contenido vencido. */}
        {esGeneral && <Opcion label="Datos" onPress={() => router.push('/(app)/admin/limpieza')} />}

        {/* La cuenta del propio admin: al pasar esta pestaña a ser el panel,
            "Editar perfil" y "Cerrar sesión" se quedaban sin ningún camino. */}
        <Opcion label="Cuenta" onPress={() => router.push('/(app)/perfil/cuenta')} />

        {/* A la vista, no escondido dentro de "Cuenta": el admin comparte
            teléfono o entra desde otro y tiene que poder salir sin buscar. */}
        <Pressable style={styles.salir} onPress={confirmarCierre} accessibilityRole="button">
          <Text style={styles.salirLabel}>Salir</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Opcion({
  label,
  insignia,
  onPress,
}: {
  label: string;
  insignia?: number;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.tarjeta, pressed && styles.tarjetaPresionada]} onPress={onPress}>
      <Text style={styles.label}>{label}</Text>
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
  // Maqueta del cliente: tarjeta negra con borde tenue, de un 21 % del ancho
  // de la pantalla de alto, y el nombre a un 11,6 % del borde.
  tarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: u(REJILLA.curvatura),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    // Un 15 % más compacto que la maqueta: ahí el panel ocupa toda la
    // pantalla, y acá abajo está la barra de pestañas. Así las siete
    // opciones y "Salir" entran sin tener que desplazar.
    paddingHorizontal: 34,
    paddingVertical: 16,
    marginBottom: 9,
  },
  tarjetaPresionada: {
    backgroundColor: Colors.backgroundAlt,
  },
  label: {
    fontFamily: Fonts.light,
    flex: 1,
    fontSize: 25,
    color: Colors.text,
  },
  salir: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 10,
  },
  salirLabel: {
    fontFamily: Fonts.light,
    fontSize: 25,
    color: Colors.accent,
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
