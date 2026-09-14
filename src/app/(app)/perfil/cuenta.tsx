import { Stack, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VistaCuenta } from '@/components/perfil/VistaCuenta';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/providers/SessionProvider';

/**
 * La cuenta del admin: los mismos datos y acciones que ve un comerciante en su
 * pestaña de perfil, pero como pantalla aparte — la tercera pestaña del admin
 * pasó a ser el panel de administración, y sin esto no quedaba ningún camino a
 * "Editar perfil" ni a "Cerrar sesión".
 */
export default function CuentaScreen() {
  const router = useRouter();
  const { session, profile } = useSession();

  if (!session || !profile) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <EncabezadoMarca subtitulo="Mi cuenta" onVolver={() => router.back()} />

      <View style={styles.card}>
        <ScrollView contentContainerStyle={styles.cardContent} showsVerticalScrollIndicator={false}>
          <VistaCuenta profile={profile} email={session.user.email} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
  },
  cardContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.six,
  },
});
