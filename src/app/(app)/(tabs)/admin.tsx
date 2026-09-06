import { Redirect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { useSession } from '@/providers/SessionProvider';

/**
 * Placeholder de la Semana 4 (Panel de Administración y Métricas). Solo
 * existe para que la pestaña "Panel Admin" de la barra inferior tenga a
 * dónde ir — la moderación real (aprobar/rechazar, historial, métricas de
 * WhatsApp) se construye en esa semana.
 */
export default function AdminScreen() {
  const { profile } = useSession();

  if (profile && profile.rol !== 'admin') {
    return <Redirect href="/(app)/(tabs)/dashboard" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.logo}>
          <Text style={styles.logoAccent}>Kh</Text>eep
        </Text>
        <Text style={styles.eyebrow}>Panel de administración</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.icon}>🛠️</Text>
        <Text style={styles.title}>Llega en la Semana 4</Text>
        <Text style={styles.message}>
          Aquí vas a poder aprobar o rechazar publicaciones, ver el historial de moderación y las métricas de clics a
          WhatsApp.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
  },
  logo: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
  },
  logoAccent: {
    color: Colors.accent,
  },
  eyebrow: {
    marginTop: 2,
    fontSize: 13,
    color: Colors.textMuted,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.two,
  },
  icon: {
    fontSize: 34,
    marginBottom: Spacing.two,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  message: {
    fontSize: 13.5,
    lineHeight: 20,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
