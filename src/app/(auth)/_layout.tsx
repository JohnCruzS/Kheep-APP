import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/providers/SessionProvider';

export default function AuthLayout() {
  const { session, recuperando } = useSession();

  // Durante la recuperación de contraseña ya hay sesión (la abre el código
  // del correo), pero todavía falta guardar la contraseña nueva.
  if (session && !recuperando) {
    return <Redirect href="/(app)/(tabs)/dashboard" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
