import { RevisionEnTarjetas } from '@/components/admin/RevisionEnTarjetas';

/**
 * Aprobar: lo que espera aprobación, en tarjetas como las del inicio
 * ("Últimos (N)", maqueta del cliente). Tocar el nombre del comercio abre
 * Aprobar / Rechazar.
 */
export default function ModeracionScreen() {
  return <RevisionEnTarjetas soloPendientes />;
}
