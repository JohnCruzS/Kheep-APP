import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { BienvenidaUbicacion } from '@/components/onboarding/BienvenidaUbicacion';
import { PantallaArranque } from '@/components/ui/PantallaArranque';
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
  const { estado, catalogoListo } = useUbicacion();

  // Mientras se lee la comuna guardada del teléfono (un parpadeo), la misma
  // vista de arranque: así no hay ni destello blanco ni cambio de pantalla.
  if (estado === 'cargando') {
    return <PantallaArranque />;
  }

  // Carga intermedia entre elegir la comuna y ver su contenido.
  if (estado === 'cambiando') {
    return <PantallaArranque />;
  }

  if (estado === 'bienvenida') {
    return <BienvenidaUbicacion />;
  }

  return (
    <>
      <AvisoDeComuna />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }} />

      {/* El inicio ya está montado y cargando DEBAJO; mientras tanto, la misma
          pantalla de arranque tapa toda la app —barra de pestañas incluida—,
          sin transición ni cambio de tamaño. Antes esta espera vivía dentro
          del inicio y se veía como un segundo arranque que entraba desde el
          costado y con la barra de abajo a la vista. */}
      {!catalogoListo && (
        <View style={StyleSheet.absoluteFill}>
          <PantallaArranque />
        </View>
      )}
    </>
  );
}

/**
 * "¿Estás en otra comuna?": el GPS detectó una distinta de la guardada.
 *
 * La comuna NUNCA cambia sola (documento EDIT APP: el cambio es manual). Si
 * el usuario dice que no, se queda con la última y no se le vuelve a
 * preguntar hasta la próxima apertura.
 */
function AvisoDeComuna() {
  const { sugerencia, elegirComuna, descartarSugerencia } = useUbicacion();

  useEffect(() => {
    if (!sugerencia) return;
    Alert.alert(
      `¿Estás en ${sugerencia.nombre}?`,
      'Podemos mostrarte los comercios de esa comuna, o seguir con la que tenías.',
      [
        { text: 'Seguir igual', style: 'cancel', onPress: descartarSugerencia },
        { text: `Ver ${sugerencia.nombre}`, onPress: () => elegirComuna(sugerencia.id) },
      ],
      { onDismiss: descartarSugerencia },
    );
  }, [sugerencia, elegirComuna, descartarSugerencia]);

  return null;
}
