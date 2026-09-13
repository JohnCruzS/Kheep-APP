import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ComponentProps, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ImageViewer } from '@/components/catalog/ImageViewer';
import { Button } from '@/components/ui/Button';
import { BrandLogo } from '@/components/ui/BrandLogo';
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
        <BrandLogo height={29} />
        <Text style={styles.eyebrow}>Perfil</Text>
      </View>

      {/* Desplazable: en pantallas más chicas el contenido no cabe entero y
          el botón de cerrar sesión quedaba cortado bajo la barra de abajo. */}
      <View style={styles.card}>
        <ScrollView contentContainerStyle={styles.cardContent} showsVerticalScrollIndicator={false}>
          <AccountView profile={profile} email={session.user.email} />
        </ScrollView>
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
  const [verFoto, setVerFoto] = useState(false);

  const nivelLabel = profile.rol === 'admin' ? 'Administrador' : profile.nivel === 2 ? 'Verificado' : 'En revisión';
  const nivelStyle =
    profile.rol === 'admin' ? styles.badgeAdmin : profile.nivel === 2 ? styles.badgeVerificado : styles.badgeRevision;

  return (
    <View style={styles.account}>
      {/* Al tocar la foto se abre completa; sin foto no hay nada que ampliar. */}
      {profile.logo_url ? (
        <Pressable
          onPress={() => setVerFoto(true)}
          accessibilityRole="imagebutton"
          accessibilityLabel="Ver foto de perfil">
          <Image source={{ uri: profile.logo_url }} style={styles.avatarImage} contentFit="cover" />
        </Pressable>
      ) : (
        <View style={styles.avatarPlaceholder} />
      )}
      {profile.logo_url ? (
        <ImageViewer
          images={[profile.logo_url]}
          visible={verFoto}
          initialIndex={0}
          onClose={() => setVerFoto(false)}
        />
      ) : null}
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

      {/* Iconos de trazo en vez de emojis: cada teléfono dibuja los emojis a
          su manera (y a todo color), y acá conviven con el resto de la
          interfaz, que es de un solo color. */}
      <View style={styles.actionRows}>
        <FilaAccion
          icono="create-outline"
          label="Editar perfil"
          onPress={() => router.push('/(app)/perfil/editar')}
        />
        <FilaAccion
          icono="megaphone-outline"
          label="Publicar banner"
          onPress={() => router.push('/(app)/banner/publicar')}
        />
        {profile.rol === 'admin' && (
          <FilaAccion
            icono="shield-checkmark-outline"
            label="Panel de administración"
            onPress={() => router.push('/(app)/(tabs)/admin')}
          />
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

function FilaAccion({
  icono,
  label,
  onPress,
}: {
  icono: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.adminRow, pressed && styles.adminRowPresionada]} onPress={onPress}>
      <Ionicons name={icono} size={18} color={Colors.cardText} />
      <Text style={styles.adminRowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={17} color={Colors.cardTextMuted} />
    </Pressable>
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
  eyebrow: {
    fontFamily: Fonts.light,
    marginTop: 2,
    fontSize: 13,
    color: Colors.textMuted,
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
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: Radius.avatar,
    backgroundColor: '#D9D9D9',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: Radius.avatar,
  },
  account: {
    alignItems: 'center',
  },
  accountName: {
    fontFamily: Fonts.bold,
    marginTop: Spacing.three,
    fontSize: 19,
    color: Colors.cardText,
  },
  badge: {
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 11.5,
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
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.cardTextMuted,
  },
  infoValue: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: Colors.cardText,
  },
  hintText: {
    fontFamily: Fonts.light,
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
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
  },
  adminRowPresionada: {
    backgroundColor: '#ECECEC',
  },
  adminRowLabel: {
    fontFamily: Fonts.medium,
    flex: 1,
    fontSize: 14,
    color: Colors.cardText,
  },
});
