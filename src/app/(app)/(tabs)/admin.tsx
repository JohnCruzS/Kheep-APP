import { Redirect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { useSession } from '@/providers/SessionProvider';

/**
 * Panel de Administración. La moderación de publicaciones (aprobar/
 * rechazar, historial) y las métricas de WhatsApp siguen pendientes — lo
 * que ya está listo es la administración de Comunas y Categorías que pidió
 * el cliente.
 */
export default function AdminScreen() {
  const { profile } = useSession();
  const router = useRouter();

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
        <Text style={styles.sectionLabel}>VITRINA</Text>
        <AdminRow icon="📍" label="Comunas" onPress={() => router.push('/(app)/admin/comunas')} />
        <AdminRow icon="🏷️" label="Categorías" onPress={() => router.push('/(app)/admin/categorias')} />

        <Text style={[styles.sectionLabel, { marginTop: Spacing.five }]}>PRÓXIMAMENTE</Text>
        <View style={styles.pendingCard}>
          <Text style={styles.pendingText}>
            Moderación de publicaciones (aprobar/rechazar con historial) y métricas de clics a WhatsApp.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function AdminRow({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowArrow}>›</Text>
    </Pressable>
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
    paddingHorizontal: Spacing.three,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: Colors.textMuted,
    marginBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  rowIcon: {
    fontSize: 18,
  },
  rowLabel: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '600',
    color: Colors.text,
  },
  rowArrow: {
    fontSize: 18,
    color: Colors.textMuted,
  },
  pendingCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderStyle: 'dashed',
  },
  pendingText: {
    fontSize: 12.5,
    lineHeight: 18,
    color: Colors.textMuted,
  },
});
