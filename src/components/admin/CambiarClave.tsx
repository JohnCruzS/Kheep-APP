import { EditorPantalla } from '@/components/admin/EditorPantalla';

/**
 * Fijar una contraseña nueva, a pantalla completa (maqueta del cliente). Las
 * contraseñas se guardan cifradas y nadie puede leerlas —ni el
 * administrador—, así que en vez de mostrarla se ofrece cambiarla.
 */
export function CambiarClave({
  visible,
  onCerrar,
  onGuardar,
}: {
  visible: boolean;
  /** De quién es (ya no se muestra: la maqueta solo tiene el campo). */
  para?: string;
  onCerrar: () => void;
  onGuardar: (clave: string) => Promise<void>;
}) {
  return (
    <EditorPantalla
      visible={visible}
      subtitulo="Contraseña"
      placeholder="Nueva contraseña"
      esClave
      validar={(valor) => (valor.length < 6 ? 'La contraseña debe tener al menos 6 caracteres.' : null)}
      onCerrar={onCerrar}
      onGuardar={onGuardar}
    />
  );
}
