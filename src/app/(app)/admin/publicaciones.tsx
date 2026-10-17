import { useLocalSearchParams } from 'expo-router';

import { RevisionEnTarjetas } from '@/components/admin/RevisionEnTarjetas';

/**
 * Las publicaciones de un usuario, en tarjetas como las del inicio. Desde la
 * lista de una categoría:
 *  - mantener presionado su nombre: todas;
 *  - tocar el número junto a su nombre ("Usuario2 (7)"): solo las que esperan
 *    aprobación, de a una y con los gestos de Aprobar (`pendientes=1`).
 */
export default function PublicacionesDeUsuarioScreen() {
  const { usuario, nombre, pendientes } = useLocalSearchParams<{ usuario: string; nombre?: string; pendientes?: string }>();
  return <RevisionEnTarjetas usuarioId={usuario} nombre={nombre} soloPendientes={pendientes === '1'} />;
}
