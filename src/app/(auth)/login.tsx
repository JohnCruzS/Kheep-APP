import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AuthCard } from '@/components/ui/AuthCard';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Colors, Spacing } from '@/constants/theme';
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
      setError('Correo o contraseña incorrectos.');
      return;
    }

    router.replace('/(app)/dashboard');
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
        hint="ejemplo@correo.com"
      />
      <TextField
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
      />

      {error ? <Text style={{ color: Colors.danger, marginTop: Spacing.three }}>{error}</Text> : null}

      <Button label="Ingresar" onPress={handleLogin} loading={loading} />
      <Button label="Registrar" variant="secondary" onPress={() => router.push('/(auth)/register')} />

      <Link href="/(auth)/forgot-password" asChild>
        <Pressable style={{ marginTop: Spacing.four, alignItems: 'center' }}>
          <Text style={{ color: Colors.textMuted }}>Olvidaste tu contraseña</Text>
        </Pressable>
      </Link>
    </AuthCard>
  );
}
