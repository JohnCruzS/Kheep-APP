import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/providers/SessionProvider';

export default function AppLayout() {
  const { session } = useSession();

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
