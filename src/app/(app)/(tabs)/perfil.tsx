import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PanelGeneral } from '@/components/admin/PanelGeneral';
import { VistaCuenta } from '@/components/perfil/VistaCuenta';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/providers/SessionProvider';

/**
 * Tercera pestaña. Su contenido depende de quién entra:
 *
 *  - Admin: el panel de administración general (título de la app, aprobar
 *    publicaciones, banners y métricas). Su propia cuenta está dentro, en "Mi
 *    cuenta": para un admin, administrar es lo que hace a diario y sus datos
 *    personales, lo que mira una vez.
 *  - Comerciante: su perfil de siempre — datos, editar y publicar banner.
 *
 * Sin sesión no llega a abrirse: el toque en la pestaña se intercepta en el
 * layout y abre el login (ver `listeners.tabPress`). El `null` de abajo es
 * solo una red de seguridad para el instante entre cerrar sesión y salir de
 * aquí; navegar durante el render es lo que hacía crashear con <Redirect>.
 */
export default function PerfilScreen() {
  const { session, profile } = useSession();

  if (!session || !profile) {
    return null;
  }

  if (profile.rol === 'admin' || profile.rol === 'admin_zona') {
    return <PanelGeneral />;
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
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
  },
  cardContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.six,
  },
});
