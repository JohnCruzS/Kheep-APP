import { Redirect } from 'expo-router';

// El catálogo es la puerta de entrada para todos, con o sin cuenta — el
// login ya no decide a dónde va nadie, solo desbloquea acciones puntuales.
export default function Index() {
  return <Redirect href="/(app)/(tabs)/dashboard" />;
}
