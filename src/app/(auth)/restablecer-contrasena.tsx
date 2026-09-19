import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AuthCard } from '@/components/ui/AuthCard';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { translateAuthError } from '@/lib/authErrors';
import { getErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/SessionProvider';

/** Segundos de espera antes de poder pedir otro código. */
const ESPERA_REENVIO = 60;

/**
 * Segundo paso de "¿Olvidaste tu contraseña?": el código que llegó al correo
 * y la contraseña nueva, en la misma pantalla.
 *
 * Van juntos a propósito. Validar el código ya inicia sesión; si se pidiera
 * primero el código y después la contraseña, quien cerrara la app entre medio
 * quedaría dentro sin haberla cambiado nunca.
 *
 * Código y no enlace: un enlace tiene que abrir la app desde el correo, y
 * muchas apps de correo no lo permiten. El código se copia desde cualquier
 * lado, incluso leyendo el correo en el computador.
 */
export default function RestablecerContrasenaScreen() {
  const { correo } = useLocalSearchParams<{ correo: string }>();
  const { setRecuperando } = useSession();

  const [codigo, setCodigo] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [espera, setEspera] = useState(ESPERA_REENVIO);

  // Un código se puede usar una sola vez. Si ya se validó y lo que falló fue
  // guardar la contraseña (por ejemplo, era igual a la anterior), el segundo
  // intento no debe volver a validarlo: la sesión ya está abierta.
  const [verificado, setVerificado] = useState(false);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  // Si sale de la pantalla sin terminar, se libera el bloqueo del layout.
  useEffect(() => () => setRecuperando(false), [setRecuperando]);

  async function handleGuardar() {
    setError(null);
    setAviso(null);

    const token = codigo.replace(/\D/g, '');
    if (!verificado && (token.length < 6 || token.length > 10)) {
      setError('Ingresa el código que te llegó al correo.');
      return;
    }
    if (nueva.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (nueva !== repetir) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    setRecuperando(true);
    let yaVerificado = verificado;
    try {
      if (!yaVerificado) {
        const { error: errorCodigo } = await supabase.auth.verifyOtp({ email: correo, token, type: 'recovery' });
        if (errorCodigo) throw errorCodigo;
        yaVerificado = true;
        setVerificado(true);
      }

      const { error: errorClave } = await supabase.auth.updateUser({ password: nueva });
      if (errorClave) throw errorClave;

      setRecuperando(false);
      router.replace('/(app)/(tabs)/dashboard');
    } catch (err) {
      // Con el código ya validado se queda aquí para corregir la contraseña;
      // si no, no hay sesión que proteger.
      if (!yaVerificado) setRecuperando(false);
      setError(translateAuthError(getErrorMessage(err, 'No se pudo cambiar la contraseña.')));
    } finally {
      setLoading(false);
    }
  }

  async function handleReenviar() {
    setError(null);
    setAviso(null);
    const { error: errorEnvio } = await supabase.auth.resetPasswordForEmail(correo);
    if (errorEnvio) {
      setError(translateAuthError(errorEnvio.message));
      return;
    }
    setCodigo('');
    setEspera(ESPERA_REENVIO);
    setAviso('Te enviamos un código nuevo. El anterior ya no sirve.');
  }

  return (
    <AuthCard eyebrow="Nueva contraseña">
      <Text style={{ fontFamily: Fonts.light, fontSize: 14, lineHeight: 20, color: Colors.cardText }}>
        Si hay una cuenta con <Text style={{ fontFamily: Fonts.medium }}>{correo}</Text>, te llegará un correo con un
        código. Revisa también la carpeta de spam.
      </Text>

      {verificado ? (
        <Text style={{ fontFamily: Fonts.medium, fontSize: 13, color: Colors.success, marginTop: Spacing.three }}>
          Código verificado. Solo falta la contraseña nueva.
        </Text>
      ) : (
        <TextField
          label="Código"
          value={codigo}
          onChangeText={(t) => setCodigo(t.replace(/\D/g, ''))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={10}
        />
      )}
      <TextField
        label="Contraseña nueva"
        value={nueva}
        onChangeText={setNueva}
        secureTextEntry
        autoComplete="new-password"
        hint="Mínimo 6 caracteres"
      />
      <TextField
        label="Repetir contraseña"
        value={repetir}
        onChangeText={setRepetir}
        secureTextEntry
        autoComplete="new-password"
      />

      {error ? (
        <Text style={{ fontFamily: Fonts.light, color: Colors.danger, marginTop: Spacing.three }}>{error}</Text>
      ) : aviso ? (
        <Text style={{ fontFamily: Fonts.light, color: Colors.success, marginTop: Spacing.three }}>{aviso}</Text>
      ) : (
        <View style={{ height: Spacing.three }} />
      )}

      <Button label="Guardar contraseña" onPress={handleGuardar} loading={loading} />

      {!verificado && (
        <Pressable
          onPress={handleReenviar}
          disabled={espera > 0}
          style={{ marginTop: Spacing.four, alignItems: 'center' }}>
          <Text style={{ fontFamily: Fonts.light, fontSize: 15, color: espera > 0 ? Colors.cardTextMuted : Colors.accent }}>
            {espera > 0 ? `Reenviar código en ${espera} s` : 'Reenviar código'}
          </Text>
        </Pressable>
      )}

      <Pressable onPress={() => router.back()} style={{ marginTop: Spacing.three, alignItems: 'center' }}>
        <Text style={{ fontFamily: Fonts.light, fontSize: 15, color: Colors.textMuted }}>Volver</Text>
      </Pressable>
    </AuthCard>
  );
}
