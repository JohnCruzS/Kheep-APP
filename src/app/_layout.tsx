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
import { StyleSheet, View } from 'react-native';

import { PantallaArranque } from '@/components/ui/PantallaArranque';
import { Colors } from '@/constants/theme';
import { SessionProvider, useSession } from '@/providers/SessionProvider';
import { UbicacionProvider, useUbicacion } from '@/providers/UbicacionProvider';

function RootNavigator() {
  const { isLoading } = useSession();
  const { estado, catalogoListo } = useUbicacion();
  const [fontsLoaded] = useFonts({
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  // La app puede dibujarse: hay sesión resuelta y tipografías.
  const appLista = !isLoading && fontsLoaded;

  /**
   * Cuándo se ve el arranque: al abrir, mientras se lee la comuna guardada,
   * en la carga intermedia al cambiar de comuna y hasta que el inicio tiene
   * su contenido. En la bienvenida no, que es una pantalla propia.
   */
  const mostrarArranque =
    !appLista || estado === 'cargando' || estado === 'cambiando' || (estado === 'listo' && !catalogoListo);

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
      {appLista && (
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'none',
            contentStyle: { backgroundColor: Colors.background },
          }}
        />
      )}

      {/* UNA sola pantalla de arranque en toda la app, montada desde el primer
          dibujado y que nunca se desmonta: solo se muestra o se esconde. Antes
          había tres —una en la raíz, otra mientras se leía la comuna y otra
          encima del inicio— y en cada relevo el logo se volvía a cargar y se
          veía un parpadeo en negro. */}
      <View
        style={[StyleSheet.absoluteFill, !mostrarArranque && styles.arranqueOculto]}
        pointerEvents={mostrarArranque ? 'auto' : 'none'}>
        <PantallaArranque />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  arranqueOculto: {
    opacity: 0,
  },
});

export default function RootLayout() {
  return (
    <SessionProvider>
      <UbicacionProvider>
        <RootNavigator />
      </UbicacionProvider>
    </SessionProvider>
  );
}
