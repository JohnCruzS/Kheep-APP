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
      <Stack screenOptions={{ headerShown: false }} />
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
