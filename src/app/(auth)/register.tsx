import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AuthCard } from '@/components/ui/AuthCard';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { translateAuthError } from '@/lib/authErrors';
import { supabase } from '@/lib/supabase';
import { isValidChileanPhone, isValidEmail, normalizeChileanPhone } from '@/lib/validation';

export default function RegisterScreen() {
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    setError(null);
    setInfo(null);

    if (nombre.trim().length === 0) {
      setError('Ingresa el nombre de tu negocio o el tuyo.');
      return;
    }
    if (!isValidEmail(correo)) {
      setError('Ingresa un correo electrónico válido.');
      return;
    }
    if (!isValidChileanPhone(telefono)) {
      setError('Ingresa un teléfono chileno válido (ej: 9 1234 5678).');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: correo.trim(),
      password,
      options: {
        data: {
          nombre: nombre.trim(),
          telefono_contacto: normalizeChileanPhone(telefono),
        },
      },
    });
    setLoading(false);

    if (signUpError) {
      setError(translateAuthError(signUpError.message));
      return;
    }

    if (data.session) {
      // Confirmación de correo desactivada en el proyecto: ya hay sesión.
      router.replace('/(app)/(tabs)/dashboard');
      return;
    }

    // Confirmación de correo activada: no hay sesión todavía.
    setInfo('Te enviamos un correo para confirmar tu cuenta. Confírmalo y luego inicia sesión.');
  }

  return (
    <AuthCard eyebrow="Registrar">
      <View style={{ alignItems: 'center', marginBottom: Spacing.two }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: Radius.avatar,
            backgroundColor: '#D9D9D9',
          }}
        />
      </View>

      <TextField label="Nombre" value={nombre} onChangeText={setNombre} autoCapitalize="words" />
      <TextField
        label="Correo"
        value={correo}
        onChangeText={setCorreo}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <TextField
        label="Teléfono"
        value={telefono}
        onChangeText={setTelefono}
        keyboardType="phone-pad"
        hint="9 1234 5678 (sin el +56, lo agregamos nosotros)"
      />
      <TextField
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password-new"
        hint="Mínimo 6 caracteres"
      />

      {error ? <Text style={{ fontFamily: Fonts.light, color: Colors.danger, marginTop: Spacing.three }}>{error}</Text> : null}
      {info ? <Text style={{ fontFamily: Fonts.light, color: Colors.cardText, marginTop: Spacing.three }}>{info}</Text> : null}

      <Button label="Guardar" onPress={handleRegister} loading={loading} />

      <Pressable onPress={() => router.back()} style={{ marginTop: Spacing.four, alignItems: 'center' }}>
        <Text style={{ fontFamily: Fonts.light, fontSize: 15, color: Colors.textMuted }}>Volver</Text>
      </Pressable>
    </AuthCard>
  );
}
