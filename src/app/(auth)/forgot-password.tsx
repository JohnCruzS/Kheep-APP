import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { AuthCard } from '@/components/ui/AuthCard';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { translateAuthError } from '@/lib/authErrors';
import { supabase } from '@/lib/supabase';
import { isValidEmail } from '@/lib/validation';

export default function ForgotPasswordScreen() {
  const [correo, setCorreo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    setError(null);

    if (!isValidEmail(correo)) {
      setError('Ingresa un correo electrónico válido.');
      return;
    }

    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(correo.trim());
    setLoading(false);

    if (resetError) {
      setError(translateAuthError(resetError.message));
      return;
    }

    // Sigue a la pantalla del código aunque el correo no exista: decir "esa
    // cuenta no existe" le serviría a cualquiera para averiguar quién está
    // registrado.
    router.push({ pathname: '/(auth)/restablecer-contrasena', params: { correo: correo.trim() } });
  }

  return (
    <AuthCard eyebrow="Recuperar contraseña">
      <TextField
        label="Correo electrónico"
        value={correo}
        onChangeText={setCorreo}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        hint="ejemplo@correo.com"
      />

      {error ? <Text style={{ fontFamily: Fonts.light, color: Colors.danger, marginTop: Spacing.three }}>{error}</Text> : null}

      <Text style={{ fontFamily: Fonts.light, fontSize: 13, color: Colors.textMuted, marginTop: Spacing.two }}>
        Te enviaremos un código para crear una contraseña nueva.
      </Text>

      <Button label="Enviar código" onPress={handleSend} loading={loading} />

      <Pressable onPress={() => router.back()} style={{ marginTop: Spacing.four, alignItems: 'center' }}>
        <Text style={{ fontFamily: Fonts.light, fontSize: 15, color: Colors.textMuted }}>Volver</Text>
      </Pressable>
    </AuthCard>
  );
}
