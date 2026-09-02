import { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';

type AuthCardProps = PropsWithChildren<{
  eyebrow: string;
}>;

/**
 * Layout compartido por Login / Registro / Recuperar contraseña:
 * fondo negro con el logo Kheep arriba, y una tarjeta blanca flotante
 * con esquinas curvas que sube desde abajo — tal como el mockup.
 */
export function AuthCard({ eyebrow, children }: AuthCardProps) {
  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.header}>
        <Text style={styles.logo}>
          <Text style={styles.logoAccent}>Kh</Text>eep
        </Text>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={styles.cardWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.card}>{children}</View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing.six,
    paddingBottom: Spacing.five,
  },
  logo: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.text,
  },
  logoAccent: {
    color: Colors.accent,
  },
  eyebrow: {
    marginTop: Spacing.one,
    fontSize: 14,
    color: Colors.textMuted,
  },
  cardWrapper: {
    flex: 1,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
  },
});
