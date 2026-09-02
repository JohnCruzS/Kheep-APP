import { Redirect } from 'expo-router';

import { useSession } from '@/providers/SessionProvider';

export default function Index() {
  const { session } = useSession();
  return <Redirect href={session ? '/(app)/dashboard' : '/(auth)/login'} />;
}
