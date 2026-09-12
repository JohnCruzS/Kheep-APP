import { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/ui/BrandLogo';
import { Colors, Fonts, Spacing } from '@/constants/theme';

type AuthCardProps = PropsWithChildren<{
  eyebrow: string;
}>;

/** Dónde arranca la tarjeta blanca, como proporción del alto de pantalla. */
const HEADER_RATIO = 0.36;
/**
 * Hasta dónde baja el negro. Va MÁS abajo que el borde superior de la
 * tarjeta a propósito: así, por los costados, se ve negro junto a la parte
 * de arriba de la tarjeta y gris junto a la de abajo — la tarjeta queda
 * flotando sobre los dos fondos, como pidió el cliente.
 */
const BAND_RATIO = 0.46;
const CARD_RADIUS = 24;

/**
 * Layout compartido por Login / Registro / Recuperar contraseña, calcado del
 * mockup del cliente: negro en el 38% superior con el logo centrado, y debajo
 * una tarjeta blanca *de borde a borde* (sin márgenes laterales) que se
 * apoya justo donde termina el negro. El gris claro solo asoma por debajo de
 * la tarjeta.
 *
 * Dos detalles del armado:
 * - El alto del header se calcula en píxeles a partir del alto de pantalla,
 *   no con un '38%', porque los porcentajes dentro del contenido de un
 *   ScrollView no son confiables.
 * - La banda negra se dibuja un poco más larga que el header (justo el radio
 *   de la tarjeta) para que las muescas de las esquinas superiores se vean
 *   negras y no grises, como en el mockup.
 */
export function AuthCard({ eyebrow, children }: AuthCardProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const headerHeight = Math.round(height * HEADER_RATIO);
  const bandHeight = Math.round(height * BAND_RATIO);

  return (
    <View style={styles.screen}>
      <View style={[styles.blackBand, { height: bandHeight }]} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={[styles.header, { height: headerHeight - insets.top }]}>
            <BrandLogo height={38} />
            <Text style={styles.eyebrow}>{eyebrow}</Text>
          </View>

          <View style={styles.card}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: Colors.backgroundSoft,
  },
  blackBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    // Márgenes laterales: dejan ver el fondo a los costados de la tarjeta
    // (negro junto a la parte de arriba, gris junto a la de abajo).
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.five,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontFamily: Fonts.light,
    fontSize: 14,
    lineHeight: 18,
    color: Colors.textMuted,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: CARD_RADIUS,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five + Spacing.two,
    paddingBottom: Spacing.six,
  },
});
