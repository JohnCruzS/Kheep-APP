import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import {
  PerfilEnCategoria,
  actualizarVisibilidadPerfil,
  eliminarPerfil,
  eliminarPublicacionesDePerfil,
  fetchCategoriasAdmin,
  fetchComunas,
  fetchPerfilesDeCategoria,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';

/**
 * Los perfiles que publican en una categoría dentro de una comuna.
 *
 * Ocultar y eliminar son cosas distintas:
 *  - Ocultar: el perfil y sus publicaciones desaparecen del catálogo, pero la
 *    cuenta queda intacta y se vuelve a mostrar con un toque. Es lo que se usa
 *    para un problema temporal.
 *  - Eliminar publicaciones: borra lo que publicó, la cuenta sigue viva y
 *    puede volver a publicar.
 *  - Eliminar perfil: borra la cuenta completa con todo lo suyo. No se
 *    deshace.
 */
export default function PerfilesDeCategoriaScreen() {
  const router = useRouter();
  const { id: comunaId, categoriaId } = useLocalSearchParams<{ id: string; categoriaId: string }>();

  const [perfiles, setPerfiles] = useState<PerfilEnCategoria[]>([]);
  const [titulo, setTitulo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lista, comunas, categorias] = await Promise.all([
        fetchPerfilesDeCategoria(comunaId, categoriaId),
        fetchComunas(),
        fetchCategoriasAdmin(),
      ]);
      setPerfiles(lista);
      const comuna = comunas.find((c) => c.id === comunaId)?.nombre ?? '';
      const categoria = categorias.find((c) => c.id === categoriaId)?.nombre ?? 'Categoría';
      setTitulo(comuna ? `${categoria} · ${comuna}` : categoria);
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido.'));
    } finally {
      setLoading(false);
    }
  }, [comunaId, categoriaId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggle(perfil: PerfilEnCategoria) {
    const nuevo = !perfil.activo;
    setPerfiles((list) => list.map((p) => (p.id === perfil.id ? { ...p, activo: nuevo } : p)));
    try {
      await actualizarVisibilidadPerfil(perfil.id, nuevo);
    } catch (err) {
      setPerfiles((list) => list.map((p) => (p.id === perfil.id ? { ...p, activo: perfil.activo } : p)));
      setError(getErrorMessage(err, 'No se pudo actualizar el perfil.'));
    }
  }

  function handleEliminar(perfil: PerfilEnCategoria) {
    // Dos pasos: primero qué se elimina, y si es la cuenta entera, una
    // confirmación aparte. Es lo único de todo el panel que no se puede
    // deshacer.
    Alert.alert(`Eliminar “${perfil.nombre}”`, '¿Qué quieres eliminar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: `Solo sus publicaciones (${perfil.publicaciones})`,
        onPress: async () => {
          try {
            const borradas = await eliminarPublicacionesDePerfil(perfil.id);
            Alert.alert('Listo', `Se eliminaron ${borradas} publicaciones. La cuenta sigue activa.`);
            load();
          } catch (err) {
            setError(getErrorMessage(err, 'No se pudieron eliminar las publicaciones.'));
          }
        },
      },
      {
        text: 'El perfil completo',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            'Eliminar la cuenta',
            `Se borrará la cuenta de “${perfil.nombre}” con todas sus publicaciones y no se puede deshacer. ` +
              'Si solo quieres que deje de verse, cancela y usa el interruptor de ocultar.',
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Eliminar cuenta',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await eliminarPerfil(perfil.id);
                    load();
                  } catch (err) {
                    setError(getErrorMessage(err, 'No se pudo eliminar el perfil.'));
                  }
                },
              },
            ],
          ),
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backLabel}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {titulo}
        </Text>
        <View style={{ width: 78 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.ayuda}>
          Perfiles con publicaciones en esta categoría y comuna. El interruptor los oculta del catálogo —junto con todas
          sus publicaciones, en cualquier comuna— y se puede revertir; “Eliminar” no.
        </Text>

        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && perfiles.length === 0 && (
          <Text style={styles.vacio}>Todavía nadie publica en esta categoría dentro de esta comuna.</Text>
        )}

        {perfiles.map((perfil) => (
          <View key={perfil.id} style={styles.row}>
            {perfil.logo_url ? (
              <Image source={{ uri: perfil.logo_url }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarVacio]} />
            )}

            <View style={styles.rowInfo}>
              <Text style={styles.nombre} numberOfLines={1}>
                {perfil.nombre}
              </Text>
              <Text style={styles.subtexto}>
                {perfil.publicaciones} {perfil.publicaciones === 1 ? 'publicación' : 'publicaciones'} acá
                {perfil.telefono_contacto ? ` · ${perfil.telefono_contacto}` : ''}
              </Text>
              <Text style={[styles.estado, !perfil.activo && styles.estadoOculto]}>
                {perfil.activo ? 'Visible' : 'Oculto'}
                {perfil.rol === 'admin' ? ' · administrador' : ''}
              </Text>
            </View>

            <View style={styles.rowActions}>
              <Switch
                value={perfil.activo}
                onValueChange={() => handleToggle(perfil)}
                trackColor={{ false: Colors.surfaceBorder, true: Colors.accent }}
                thumbColor="#FFFFFF"
              />
              {/* A un administrador no se le ofrece eliminar: la base lo
                  rechaza igual (ver 0017) y el botón solo confundiría. */}
              {perfil.rol !== 'admin' && (
                <Pressable onPress={() => handleEliminar(perfil)} hitSlop={8}>
                  <Text style={styles.eliminar}>Eliminar</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
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
    fontFamily: Fonts.medium,
    color: Colors.text,
    fontSize: 15,
    width: 78,
  },
  topTitle: {
    fontFamily: Fonts.semiBold,
    color: Colors.text,
    fontSize: 15,
    flex: 1,
    textAlign: 'center',
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
  },
  ayuda: {
    fontFamily: Fonts.light,
    marginBottom: Spacing.three,
    fontSize: 12.5,
    lineHeight: 18,
    color: Colors.textMuted,
  },
  vacio: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarVacio: {
    backgroundColor: Colors.background,
  },
  rowInfo: {
    flex: 1,
  },
  nombre: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.text,
  },
  subtexto: {
    fontFamily: Fonts.light,
    fontSize: 11.5,
    color: Colors.textMuted,
    marginTop: 2,
  },
  estado: {
    fontFamily: Fonts.medium,
    fontSize: 11.5,
    color: Colors.success,
    marginTop: 3,
  },
  estadoOculto: {
    color: Colors.warning,
  },
  rowActions: {
    alignItems: 'center',
    gap: 4,
  },
  eliminar: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: Colors.danger,
  },
});
