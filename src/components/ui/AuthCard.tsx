import { PropsWithChildren } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/ui/BrandLogo';
import { FormScroll } from '@/components/ui/FormScroll';
import { TarjetaClaraProvider } from '@/components/ui/TarjetaClara';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useAltoTeclado } from '@/hooks/useTeclado';

/** Dónde arranca la tarjeta blanca, como proporción del alto de pantalla. */
const HEADER_RATIO = 0.36;
/**
 * Hasta dónde baja el negro. Va MÁS abajo que el borde superior de la
 * tarjeta a propósito: así, por los costados, se ve negro junto a la parte
 * de arriba de la tarjeta y gris junto a la de abajo — la tarjeta queda
 * flotando sobre los dos fondos, como pidió el cliente.
 */
const BAND_RATIO = 0.46;
/**
 * Con el teclado abierto el encabezado se convierte en una franja compacta:
 * el logo sigue ahí, más chico, y todo el espacio que sobra se lo queda el
 * formulario. Es un alto fijo y no un porcentaje para que la franja se vea
 * igual de ordenada en un teléfono chico y en uno grande.
 */
const HEADER_COMPACTO = 78;
const LOGO_NORMAL = 38;
const LOGO_COMPACTO = 26;
const CARD_RADIUS = 24;

type AuthCardProps = PropsWithChildren<{
  eyebrow: string;
}>;

/**
 * Layout compartido por Login / Registro / Recuperar contraseña, calcado del
 * mockup del cliente: negro en el 36 % superior con el logo centrado, y debajo
 * una tarjeta blanca que se apoya justo donde termina el negro. El gris claro
 * solo asoma por debajo de la tarjeta.
 *
 * Al abrir el teclado la pantalla se reordena en dos partes en vez de
 * empujarlo todo hacia arriba:
 *
 *  - Arriba queda una franja negra con el logo más chico. No se desplaza ni
 *    desaparece, así que la pantalla se sigue viendo como Kheep y la tarjeta
 *    nunca aparece cortada contra el borde de la pantalla.
 *  - Abajo, la tarjeta se queda con todo el espacio libre y su contenido se
 *    desplaza por dentro si no cabe. El campo que se está escribiendo queda
 *    sobre el teclado y el borde redondeado de la tarjeta sigue a la vista.
 *
 * Todo se calcula con el alto real de la pantalla y el alto real del teclado
 * de ese teléfono (ver `useAltoTeclado`), no con medidas afinadas para un
 * dispositivo en particular.
 */
export function AuthCard({ eyebrow, children }: AuthCardProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const altoTeclado = useAltoTeclado();
  const tecladoAbierto = altoTeclado > 0;

  const headerHeight = tecladoAbierto ? HEADER_COMPACTO + insets.top : Math.round(height * HEADER_RATIO);
  // La banda negra mantiene su distancia con el encabezado: si se quedara
  // fija mientras el encabezado se encoge, taparía media tarjeta.
  const bandHeight = tecladoAbierto
    ? headerHeight + CARD_RADIUS
    : headerHeight + Math.round(height * (BAND_RATIO - HEADER_RATIO));

  return (
    <View style={styles.screen}>
      <View style={[styles.blackBand, { height: bandHeight }]} />

      {/* El encabezado va como `encabezado` y no dentro del contenido: así
          queda fuera del área que se desplaza y no puede irse de la pantalla.
          `FormScroll` se encarga del teclado — reservar su alto y correr el
          formulario para que el campo enfocado no quede tapado— igual que en
          el resto de la app. */}
      <FormScroll
        encabezado={
          <View style={[styles.header, { height: headerHeight, paddingTop: insets.top }]}>
            <BrandLogo height={tecladoAbierto ? LOGO_COMPACTO : LOGO_NORMAL} />
            <Text style={[styles.eyebrow, tecladoAbierto && styles.eyebrowCompacto]}>{eyebrow}</Text>
          </View>
        }
        // Con el teclado abierto se recorta el aire de abajo: son los últimos
        // píxeles que hacían falta para que el enlace del final ("Volver") no
        // quedara cortado por el borde del teclado.
        contentContainerStyle={[styles.scrollContent, tecladoAbierto && styles.scrollContentCompacto]}>
        {/* Con el teclado abierto el aire de arriba de la tarjeta sobra: se
            recorta para que no queden huecos entre el borde y el primer campo. */}
        <View style={[styles.card, tecladoAbierto && styles.cardCompacta]}>
          <TarjetaClaraProvider value={true}>{children}</TarjetaClaraProvider>
        </View>
      </FormScroll>
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
  eyebrowCompacto: {
    fontSize: 12.5,
    marginTop: 2,
  },
  scrollContent: {
    // Márgenes laterales: dejan ver el fondo a los costados de la tarjeta
    // (negro junto a la parte de arriba, gris junto a la de abajo).
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.five,
  },
  scrollContentCompacto: {
    paddingBottom: Spacing.two,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: CARD_RADIUS,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five + Spacing.two,
    paddingBottom: Spacing.six,
  },
  cardCompacta: {
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
  },
});
