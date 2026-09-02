import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Colors, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/SessionProvider';

export default function DashboardScreen() {
  const { session } = useSession();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background, padding: Spacing.four }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: Colors.text, fontSize: 22, fontWeight: '700', marginBottom: Spacing.two }}>
          Bienvenido a Kheep
        </Text>
        <Text style={{ color: Colors.textMuted, marginBottom: Spacing.five }}>
          {session?.user.email}
        </Text>
        <Text style={{ color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.five }}>
          Aquí va el catálogo (Semana 2 del plan): banners, categorías y publicaciones.
        </Text>
        <Button label="Cerrar sesión" onPress={() => supabase.auth.signOut()} />
      </View>
    </SafeAreaView>
  );
}
