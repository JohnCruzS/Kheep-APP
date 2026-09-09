import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Fonts, Spacing } from '@/constants/theme';
import { fetchPublicacionesPendientes } from '@/lib/catalog';
import { useSession } from '@/providers/SessionProvider';

/**
 * Panel de Administración: vitrina (comunas/categorías), moderación de
 * publicaciones y métricas de WhatsApp.
 */
export default function AdminScreen() {
  const { profile } = useSession();
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
        <Text style={styles.sectionLabel}>MODERACIÓN</Text>
        <AdminRow
          icon="🛡️"
          label="Publicaciones pendientes"
          badge={pendientes && pendientes > 0 ? pendientes : undefined}
          onPress={() => router.push('/(app)/admin/moderacion')}
        />
        <AdminRow icon="📊" label="Métricas de WhatsApp" onPress={() => router.push('/(app)/admin/metricas')} />

        <Text style={[styles.sectionLabel, { marginTop: Spacing.five }]}>VITRINA</Text>
        <AdminRow icon="📍" label="Comunas" onPress={() => router.push('/(app)/admin/comunas')} />
        <AdminRow icon="🏷️" label="Categorías" onPress={() => router.push('/(app)/admin/categorias')} />
      </View>
    </SafeAreaView>
  );
}

function AdminRow({
  icon,
  label,
  badge,
  onPress,
}: {
  icon: string;
  label: string;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text style={styles.rowLabel}>{label}</Text>
      {badge !== undefined && (
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{badge}</Text>
        </View>
      )}
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
    fontFamily: Fonts.extraBold,
    fontSize: 26,
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
  badge: {
    backgroundColor: Colors.accent,
    borderRadius: 20,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  rowArrow: {
    fontSize: 18,
    color: Colors.textMuted,
  },
});
