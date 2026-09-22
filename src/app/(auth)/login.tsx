import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AuthCard } from '@/components/ui/AuthCard';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { translateAuthError } from '@/lib/authErrors';
import { supabase } from '@/lib/supabase';
import { isValidEmail } from '@/lib/validation';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);

    if (!isValidEmail(email)) {
      setError('Ingresa un correo electrónico válido.');
      return;
    }
    if (password.length === 0) {
      setError('Ingresa tu contraseña.');
      return;
    }

    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (signInError) {
      // Traducido: además de la contraseña equivocada, puede ser una cuenta
      // suspendida, y la persona tiene que saber cuál de las dos es.
      setError(translateAuthError(signInError.message));
      return;
    }

    router.replace('/(app)/(tabs)/dashboard');
  }

  return (
    <AuthCard eyebrow="Acceso">
      <TextField
        label="Correo electrónico"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <TextField
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
      />

      {error ? (
        <Text style={{ fontFamily: Fonts.light, color: Colors.danger, marginTop: Spacing.three }}>{error}</Text>
      ) : (
        // Respiro entre el último campo y los botones, como en el mockup.
        <View style={{ height: Spacing.three }} />
      )}

      <Button label="Ingresar" onPress={handleLogin} loading={loading} />
      <Button label="Registrar" variant="secondary" onPress={() => router.push('/(auth)/register')} />

      <Link href="/(auth)/forgot-password" asChild>
        <Pressable style={{ marginTop: Spacing.four, alignItems: 'center' }}>
          <Text style={{ fontFamily: Fonts.light, fontSize: 15, color: Colors.textMuted }}>
            Olvidaste tu contraseña
          </Text>
        </Pressable>
      </Link>

      {/* A Inicio, no router.back(): al entrar desde la pestaña Perfil sin
          sesión, "atrás" sería el redirect que trajo aquí y volvería a caer
          en este mismo login. */}
      <Pressable
        onPress={() => router.replace('/(app)/(tabs)/dashboard')}
        style={{ marginTop: Spacing.three, alignItems: 'center' }}>
        <Text style={{ fontFamily: Fonts.light, fontSize: 15, color: Colors.textMuted }}>Volver</Text>
      </Pressable>
    </AuthCard>
  );
}
