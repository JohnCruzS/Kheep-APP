import {
  Poppins_300Light,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/poppins';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { PantallaArranque } from '@/components/ui/PantallaArranque';
import { Colors } from '@/constants/theme';
import { SessionProvider, useSession } from '@/providers/SessionProvider';
import { UbicacionProvider } from '@/providers/UbicacionProvider';

function RootNavigator() {
  const { isLoading } = useSession();
  const [fontsLoaded] = useFonts({
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  // Misma vista que el splash nativo: el arranque no parpadea entre dos
  // pantallas distintas (documento EDIT APP).
  if (isLoading || !fontsLoaded) {
    return <PantallaArranque />;
  }

  return (
    <>
      <StatusBar style="light" />
      {/* Fondo negro en el navegador: por defecto es blanco, y al pasar de la
          pantalla de arranque al inicio se veía un destello blanco, como si
          apareciera otra pantalla en medio. */}
      {/* Sin animación entre los grupos de pantallas: al pasar del arranque a
          la app, la pantalla entraba deslizándose desde la derecha —dejando
          una franja clara al costado— y, como el arranque y lo que venía
          detrás son iguales, parecía que el inicio se mostraba dos veces. */}
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
          contentStyle: { backgroundColor: Colors.background },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <UbicacionProvider>
        <RootNavigator />
      </UbicacionProvider>
    </SessionProvider>
  );
}
