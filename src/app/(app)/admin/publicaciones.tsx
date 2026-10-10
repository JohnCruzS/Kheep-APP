import { useLocalSearchParams } from 'expo-router';

import { RevisionEnTarjetas } from '@/components/admin/RevisionEnTarjetas';

/**
 * Las publicaciones de un usuario, en tarjetas como las del inicio. Se llega
 * tocando el número junto a su nombre en la lista de una categoría
 * ("Usuario2 (5)").
 */
export default function PublicacionesDeUsuarioScreen() {
  const { usuario, nombre } = useLocalSearchParams<{ usuario: string; nombre?: string }>();
  return <RevisionEnTarjetas usuarioId={usuario} nombre={nombre} />;
}
