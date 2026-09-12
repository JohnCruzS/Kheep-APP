import { Stack } from 'expo-router';
import { View } from 'react-native';

import { BienvenidaUbicacion } from '@/components/onboarding/BienvenidaUbicacion';
import { Colors } from '@/constants/theme';
import { useUbicacion } from '@/providers/UbicacionProvider';

// El catálogo es la vitrina pública de Kheep: cualquiera lo navega sin
// cuenta, igual que la especificación (contacto directo por WhatsApp, sin
// checkout). El login solo hace falta para acciones de comerciante
// (publicar, editar, moderar) — esas pantallas se protegen una por una
// cuando se construyen, no toda esta sección de golpe.
//
// Antes del catálogo hay una sola condición: saber en qué comuna está el
// usuario. La primera vez que abre la app eso se resuelve en la pantalla de
// bienvenida (permiso de ubicación → detectar la comuna, o elegirla a mano);
// después queda guardada y se entra directo.
export default function AppLayout() {
  const { estado } = useUbicacion();

  // Mientras se lee la comuna guardada del teléfono (un parpadeo), el fondo
  // negro: así el arranque no muestra un destello blanco antes del logo.
  if (estado === 'cargando') {
    return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
  }

  if (estado === 'bienvenida') {
    return <BienvenidaUbicacion />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
