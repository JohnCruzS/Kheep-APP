import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { PickerField } from '@/components/forms/PickerField';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { Comuna, MiPerfil, actualizarPerfil, fetchComunas, fetchMiPerfil } from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { PickedImage, pickAndCompressImage, uploadCompressedImage } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import { isValidChileanPhone, normalizeChileanPhone } from '@/lib/validation';
import { useSession } from '@/providers/SessionProvider';

export default function EditarPerfilScreen() {
  const router = useRouter();
  const { refreshProfile } = useSession();

  const [perfil, setPerfil] = useState<MiPerfil | null>(null);
  const [comunas, setComunas] = useState<Comuna[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [perfilData, comunasData] = await Promise.all([fetchMiPerfil(), fetchComunas()]);
      setPerfil(perfilData);
      setComunas(comunasData);
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backLabel}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.topTitle}>Editar perfil</Text>
        <View style={{ width: 70 }} />
      </View>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && !perfil && (
        <EmptyState title="No encontramos tu perfil" message="Intenta cerrar sesión y volver a entrar." />
      )}
      {!loading && !error && perfil && (
        <View style={styles.card}>
          <EditarPerfilForm
            perfil={perfil}
            comunas={comunas}
            onSaved={async () => {
              await refreshProfile();
              router.back();
            }}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

function EditarPerfilForm({
  perfil,
  comunas,
  onSaved,
}: {
  perfil: MiPerfil;
  comunas: Comuna[];
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState(perfil.nombre);
  const [telefono, setTelefono] = useState((perfil.telefono_contacto ?? '').replace('+56', ''));
  const [logo, setLogo] = useState<PickedImage | null>(null);
  const [logoUrl, setLogoUrl] = useState(perfil.logo_url);
  const [comunaId, setComunaId] = useState<string | null>(perfil.comuna_id);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const comunaNombre = comunas.find((c) => c.id === comunaId)?.nombre ?? '';

  async function handlePickLogo() {
    try {
      const image = await pickAndCompressImage();
      if (image) setLogo(image);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo abrir la galería.'));
    }
  }

  async function handleGuardar() {
    setError(null);

    if (nombre.trim().length === 0) {
      setError('Ponle un nombre a tu negocio.');
      return;
    }
    if (!isValidChileanPhone(telefono)) {
      setError('Ingresa un teléfono chileno válido (ej: 9 1234 5678).');
      return;
    }

    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const finalLogoUrl = logo ? await uploadCompressedImage('logos', auth.user!.id, logo, 'logo') : logoUrl;

      await actualizarPerfil({
        nombre: nombre.trim(),
        telefonoContacto: normalizeChileanPhone(telefono),
        comunaId,
        logoUrl: finalLogoUrl,
      });

      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudieron guardar los cambios.'));
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
      <Pressable onPress={handlePickLogo} style={styles.avatarWrapper}>
        {logo ? (
          <Image source={{ uri: logo.uri }} style={styles.avatarImage} contentFit="cover" />
        ) : logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.avatarImage} contentFit="cover" />
        ) : (
          <View style={styles.avatarPlaceholder} />
        )}
      </Pressable>

      <TextField label="Nombre" value={nombre} onChangeText={setNombre} autoCapitalize="words" />

      <PickerField
        label="Comuna"
        value={comunaNombre}
        open={pickerOpen}
        onToggle={() => setPickerOpen((p) => !p)}
        options={comunas.map((c) => ({ id: c.id, label: c.nombre }))}
        onSelect={(id) => {
          setComunaId(id);
          setPickerOpen(false);
        }}
      />

      <TextField
        label="Teléfono"
        value={telefono}
        onChangeText={setTelefono}
        keyboardType="phone-pad"
        hint="9 1234 5678 (sin el +56, lo agregamos nosotros)"
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {saving ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.three }} />
      ) : (
        <Button label="Guardar cambios" onPress={handleGuardar} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  backLabel: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
    width: 70,
  },
  topTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    flex: 1,
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
  },
  formContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.six,
  },
  avatarWrapper: {
    alignSelf: 'center',
    marginBottom: Spacing.two,
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: Radius.avatar,
    backgroundColor: '#D9D9D9',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: Radius.avatar,
  },
  errorText: {
    marginTop: Spacing.three,
    fontSize: 13,
    color: Colors.danger,
  },
});
