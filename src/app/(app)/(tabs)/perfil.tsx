import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/SessionProvider';

/**
 * "Perfil" es el único lugar de la app donde se pide iniciar sesión — el
 * catálogo (Inicio) es público para cualquiera. Su contenido cambia por
 * completo según el rol/nivel del que entra (spec: "cada rol con sus
 * vistas correspondientes").
 */
export default function PerfilScreen() {
  const { session, profile } = useSession();

  // Sin sesión esta pantalla no tiene nada que mostrar: el toque en la
  // pestaña se intercepta en el layout y abre el login directamente (ver
  // `listeners.tabPress`). Esto es solo una red de seguridad para el
  // instante entre cerrar sesión y salir de aquí — no navega durante el
  // render, que es justo lo que hacía crashear con <Redirect>.
  if (!session || !profile) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.logo}>
          <Text style={styles.logoAccent}>Kh</Text>eep
        </Text>
        <Text style={styles.eyebrow}>Perfil</Text>
      </View>

      <View style={styles.card}>
        <AccountView profile={profile} email={session.user.email} />
      </View>
    </SafeAreaView>
  );
}


function AccountView({
  profile,
  email,
}: {
  profile: NonNullable<ReturnType<typeof useSession>['profile']>;
  email: string | undefined;
}) {
  const router = useRouter();

  const nivelLabel = profile.rol === 'admin' ? 'Administrador' : profile.nivel === 2 ? 'Verificado' : 'En revisión';
  const nivelStyle =
    profile.rol === 'admin' ? styles.badgeAdmin : profile.nivel === 2 ? styles.badgeVerificado : styles.badgeRevision;

  return (
    <View style={styles.account}>
      <View style={styles.avatarPlaceholder} />
      <Text style={styles.accountName}>{profile.nombre}</Text>
      <View style={[styles.badge, nivelStyle]}>
        <Text style={styles.badgeLabel}>{nivelLabel}</Text>
      </View>

      <View style={styles.infoList}>
        <InfoRow label="Correo" value={email ?? '—'} />
        <InfoRow label="Teléfono" value={profile.telefono_contacto ?? '—'} />
      </View>

      {profile.rol === 'comerciante' && profile.nivel === 1 && (
        <Text style={styles.hintText}>
          Tus publicaciones nuevas quedan pendientes hasta que un admin las revise. Esto es automático, no depende de
          esta pantalla.
        </Text>
      )}

      <View style={styles.actionRows}>
        <Pressable style={styles.adminRow} onPress={() => router.push('/(app)/perfil/editar')}>
          <Text style={styles.adminRowLabel}>✏️ Editar perfil</Text>
          <Text style={styles.adminRowArrow}>›</Text>
        </Pressable>

        <Pressable style={styles.adminRow} onPress={() => router.push('/(app)/banner/publicar')}>
          <Text style={styles.adminRowLabel}>📣 Publicar banner</Text>
          <Text style={styles.adminRowArrow}>›</Text>
        </Pressable>

        {profile.rol === 'admin' && (
          <Pressable style={styles.adminRow} onPress={() => router.push('/(app)/(tabs)/admin')}>
            <Text style={styles.adminRowLabel}>🛡️ Panel de moderación</Text>
            <Text style={styles.adminRowArrow}>›</Text>
          </Pressable>
        )}
      </View>

      <Button
        label="Cerrar sesión"
        variant="secondary"
        onPress={async () => {
          await supabase.auth.signOut();
          router.replace('/(app)/(tabs)/dashboard');
        }}
      />
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
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
  card: {
    flex: 1,
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: Radius.avatar,
    backgroundColor: '#D9D9D9',
  },
  account: {
    alignItems: 'center',
  },
  accountName: {
    marginTop: Spacing.three,
    fontSize: 19,
    fontWeight: '800',
    color: Colors.cardText,
  },
  badge: {
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeLabel: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  badgeRevision: {
    backgroundColor: Colors.warningBg,
  },
  badgeVerificado: {
    backgroundColor: Colors.successBg,
  },
  badgeAdmin: {
    backgroundColor: 'rgba(255,59,0,0.12)',
  },
  infoList: {
    width: '100%',
    marginTop: Spacing.five,
    gap: Spacing.three,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.inputBorder,
    paddingBottom: Spacing.two,
  },
  infoLabel: {
    fontSize: 13,
    color: Colors.cardTextMuted,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.cardText,
  },
  hintText: {
    marginTop: Spacing.four,
    fontSize: 12.5,
    lineHeight: 18,
    color: Colors.cardTextMuted,
    textAlign: 'center',
  },
  actionRows: {
    width: '100%',
    marginTop: Spacing.five,
    gap: Spacing.two,
  },
  adminRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
  },
  adminRowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.cardText,
  },
  adminRowArrow: {
    fontSize: 18,
    color: Colors.cardTextMuted,
  },
});
