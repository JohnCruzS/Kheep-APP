import { EditorPantalla } from '@/components/admin/EditorPantalla';

/**
 * Cambiar el nombre de una cuenta del panel (se abre manteniendo apretado el
 * nombre en Admin), con la misma vista a pantalla completa que el correo y la
 * contraseña: subtítulo "Nombre", un campo al centro, "Guardar" y "Cancelar".
 */
export function CambiarNombre({
  visible,
  actual,
  onCerrar,
  onGuardar,
}: {
  visible: boolean;
  /** El nombre de ahora, para no guardar si no cambió. */
  actual: string;
  onCerrar: () => void;
  onGuardar: (nombre: string) => Promise<void>;
}) {
  return (
    <EditorPantalla
      visible={visible}
      subtitulo="Nombre"
      placeholder="Nuevo nombre"
      // Arranca con el nombre de ahora, para corregirlo sin reescribirlo.
      inicial={actual}
      propsCampo={{ autoCapitalize: 'words', maxLength: 60 }}
      validar={(valor) => (valor.trim() ? null : 'Escribe un nombre.')}
      onCerrar={onCerrar}
      onGuardar={async (valor) => {
        const nombre = valor.trim();
        if (nombre === actual.trim()) return;
        await onGuardar(nombre);
      }}
    />
  );
}
