import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';

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

  // Todavía no se sabe la comuna: no se monta nada, para no pedir un catálogo
  // que habría que descartar. La pantalla de arranque, que vive en la raíz,
  // está tapando la app mientras tanto.
  if (estado === 'cargando') {
    return null;
  }

  if (estado === 'bienvenida') {
    return <BienvenidaUbicacion />;
  }

  // Ojo: en la carga intermedia al cambiar de comuna NO se devuelve otra
  // pantalla. Hacerlo desmontaba el navegador entero —pestañas incluidas— y
  // ese desmontaje era el parpadeo más visible; ahora la app se queda montada
  // recargando por detrás y el arranque de la raíz la tapa.
  return (
    <>
      <AvisoDeComuna />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }} />
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
