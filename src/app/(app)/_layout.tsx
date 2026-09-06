import { Stack } from 'expo-router';

// El catálogo es la vitrina pública de Kheep: cualquiera lo navega sin
// cuenta, igual que la especificación (contacto directo por WhatsApp, sin
// checkout). El login solo hace falta para acciones de comerciante
// (publicar, editar, moderar) — esas pantallas se protegen una por una
// cuando se construyan, no toda esta sección de golpe.
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
