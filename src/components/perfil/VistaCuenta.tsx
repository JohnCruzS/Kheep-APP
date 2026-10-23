import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ComponentProps, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Texto';

import { EditorPantalla } from '@/components/admin/EditorPantalla';
import { ImageViewer } from '@/components/catalog/ImageViewer';
import { Button } from '@/components/ui/Button';
import { Interruptor } from '@/components/ui/Interruptor';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { cambiarMiCorreo, cambiarMiFoto, cambiarMiTelefono, fetchMiVisibilidad, pausarMiPerfil } from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { pickAndCompressImage, uploadCompressedImage } from '@/lib/images';
import {
  MENSAJE_CELULAR,
  celularLocal,
  isValidChileanPhone,
  isValidEmail,
  normalizeChileanPhone,
  soloCelular,
} from '@/lib/validation';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/SessionProvider';
import { FotoRemota } from '@/components/ui/FotoRemota';

/**
 * Los datos de la cuenta y sus acciones. Está aparte de la pantalla porque lo
 * usan dos: la pestaña de perfil de los comerciantes y la pantalla "Mi cuenta"
 * del admin, cuya tercera pestaña pasó a ser el panel de administración.
 */
export function VistaCuenta({
  profile,
  email,
}: {
  profile: NonNullable<ReturnType<typeof useSession>['profile']>;
  email: string | undefined;
}) {
  const router = useRouter();
  const { refreshProfile } = useSession();
  const [verFoto, setVerFoto] = useState(false);
  /** Qué dato está cambiando el comerciante (tocando el correo o el teléfono). */
  const [editando, setEditando] = useState<'correo' | 'telefono' | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  // La pausa voluntaria del comerciante (0038). El admin tiene su propio
  // interruptor, que manda: si él lo ocultó, acá solo se avisa.
  const esComerciante = profile.rol === 'comerciante';
  const [visibilidad, setVisibilidad] = useState<{ pausado: boolean; ocultoPorAdmin: boolean } | null>(null);
  useEffect(() => {
    if (!esComerciante) return;
    fetchMiVisibilidad()
      .then((v) => setVisibilidad(v.disponible ? v : null))
      .catch(() => setVisibilidad(null));
  }, [esComerciante]);

  async function cambiarVisible(visible: boolean) {
    if (!visibilidad) return;
    const antes = visibilidad;
    setVisibilidad({ ...antes, pausado: !visible });
    try {
      await pausarMiPerfil(!visible);
    } catch (err) {
      setVisibilidad(antes);
      Alert.alert('No se pudo guardar', getErrorMessage(err, 'Intenta de nuevo.'));
    }
  }

  /** Tocar la foto: elegir otra (el comerciante); el admin la ve en grande. */
  async function cambiarFoto() {
    try {
      const foto = await pickAndCompressImage({ uso: 'logo' });
      if (!foto) return;
      setSubiendoFoto(true);
      const { data: auth } = await supabase.auth.getUser();
      const url = await uploadCompressedImage('logos', auth.user!.id, foto, 'logo');
      await cambiarMiFoto(url);
      await refreshProfile();
    } catch (err) {
      Alert.alert('No se pudo cambiar la foto', getErrorMessage(err, 'Intenta de nuevo.'));
    } finally {
      setSubiendoFoto(false);
    }
  }

  const nivelLabel = profile.rol === 'admin' ? 'Administrador' : profile.nivel === 2 ? 'Verificado' : 'En revisión';
  const nivelStyle =
    profile.rol === 'admin' ? styles.badgeAdmin : profile.nivel === 2 ? styles.badgeVerificado : styles.badgeRevision;

  return (
    <View style={styles.account}>
      {/* El comerciante toca la foto para cambiarla; el admin, para verla completa. */}
      <Pressable
        onPress={esComerciante ? cambiarFoto : () => profile.logo_url && setVerFoto(true)}
        disabled={subiendoFoto || (!esComerciante && !profile.logo_url)}
        accessibilityRole="imagebutton"
        accessibilityLabel={esComerciante ? 'Cambiar foto de perfil' : 'Ver foto de perfil'}>
        {profile.logo_url ? (
          <FotoRemota uri={profile.logo_url} ancho={72} style={[styles.avatarImage, subiendoFoto && styles.subiendo]} />
        ) : (
          <View style={[styles.avatarPlaceholder, subiendoFoto && styles.subiendo]} />
        )}
      </Pressable>
      {profile.logo_url ? (
        <ImageViewer
          images={[profile.logo_url]}
          visible={verFoto}
          initialIndex={0}
          onClose={() => setVerFoto(false)}
        />
      ) : null}
      <Text style={styles.accountName}>{profile.nombre}</Text>
      <View style={[styles.badge, nivelStyle]}>
        <Text style={styles.badgeLabel}>{nivelLabel}</Text>
      </View>

      <View style={styles.infoList}>
        {/* El comerciante los toca para cambiarlos. */}
        <InfoRow label="Correo" value={email ?? '—'} onPress={esComerciante ? () => setEditando('correo') : undefined} />
        <InfoRow
          label="Teléfono"
          value={profile.telefono_contacto ? celularLocal(profile.telefono_contacto) : '—'}
          onPress={esComerciante ? () => setEditando('telefono') : undefined}
        />
      </View>

      {/* Mostrar u ocultar el perfil por un tiempo, cuando quiera
          (vacaciones, sin stock…). Apagado, ni él ni sus publicaciones se ven. */}
      {esComerciante && visibilidad && (
        <View style={styles.visibleBox}>
          <View style={styles.visibleFila}>
            <Text style={styles.visibleLabel}>Perfil visible</Text>
            <Interruptor
              value={!visibilidad.pausado}
              onValueChange={(v) => void cambiarVisible(v)}
              accessibilityLabel="Perfil visible"
            />
          </View>
          {/* Solo se avisa si no se está viendo (pedido del cliente: sin
              textos de ayuda cuando está todo normal). */}
          {(visibilidad.ocultoPorAdmin || visibilidad.pausado) && (
            <Text style={styles.visibleNota}>
              {visibilidad.ocultoPorAdmin
                ? 'Un administrador ocultó tu perfil: no se ve en el catálogo hasta que lo vuelva a mostrar.'
                : 'Tu perfil está en pausa: los demás no ven tu perfil ni tus publicaciones (tú sí, para revisarlas).'}
            </Text>
          )}
        </View>
      )}

      {/* Iconos de trazo en vez de emojis: cada teléfono dibuja los emojis a
          su manera (y a todo color), y acá conviven con el resto de la
          interfaz, que es de un solo color.

          Ya no está el acceso al panel de administración: el admin lo tiene
          en su propia pestaña, así que acá solo repetía un camino. Y
          "Publicar banner" es para los comerciantes —que no tienen panel—;
          el admin lo hace desde Panel Admin → Banners. */}
      {esComerciante ? (
        // Maqueta del cliente: "Publicar anuncio" y "Salir" en texto rojo.
        <>
          <Pressable
            style={({ pressed }) => [styles.anuncio, pressed && styles.presionado]}
            onPress={() => router.push('/(app)/banner/publicar')}
            accessibilityRole="button">
            <Text style={styles.anuncioLabel}>Publicar anuncio</Text>
          </Pressable>
          <Pressable onPress={salir} hitSlop={10} accessibilityRole="button">
            <Text style={styles.salir}>Salir</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.actionRows}>
            <FilaAccion
              icono="create-outline"
              label="Editar perfil"
              onPress={() => router.push('/(app)/perfil/editar')}
            />
            {profile.rol !== 'admin' && (
              <FilaAccion
                icono="megaphone-outline"
                label="Publicar banner"
                onPress={() => router.push('/(app)/banner/publicar')}
              />
            )}
          </View>
          <Button label="Cerrar sesión" variant="secondary" onPress={salir} />
        </>
      )}

      <EditorPantalla
        visible={editando === 'correo'}
        subtitulo="Correo"
        placeholder="Correo"
        inicial={email ?? ''}
        propsCampo={{ keyboardType: 'email-address', autoCapitalize: 'none', autoCorrect: false }}
        validar={(v) => (isValidEmail(v) ? null : 'Escribe un correo válido.')}
        onCerrar={() => setEditando(null)}
        onGuardar={async (v) => {
          await cambiarMiCorreo(v);
          Alert.alert('Revisa tu correo', `Te enviamos un correo a ${v.trim()} para confirmar el cambio.`);
        }}
      />
      <EditorPantalla
        visible={editando === 'telefono'}
        subtitulo="Teléfono"
        placeholder="912345678"
        inicial={profile.telefono_contacto ? celularLocal(profile.telefono_contacto) : ''}
        propsCampo={{ keyboardType: 'number-pad', maxLength: 9 }}
        validar={(v) => (isValidChileanPhone(soloCelular(v)) ? null : MENSAJE_CELULAR)}
        onCerrar={() => setEditando(null)}
        onGuardar={async (v) => {
          await cambiarMiTelefono(normalizeChileanPhone(soloCelular(v)));
          await refreshProfile();
        }}
      />
    </View>
  );

  async function salir() {
    await supabase.auth.signOut();
    router.replace('/(app)/(tabs)/dashboard');
  }
}

function FilaAccion({
  icono,
  label,
  onPress,
}: {
  icono: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.adminRow, pressed && styles.adminRowPresionada]} onPress={onPress}>
      <Ionicons name={icono} size={20} color={Colors.text} />
      <Text style={styles.adminRowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={17} color={Colors.textMuted} />
    </Pressable>
  );
}

function InfoRow({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <Pressable style={styles.infoRow} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  subiendo: {
    opacity: 0.4,
  },
  anuncio: {
    alignSelf: 'stretch',
    marginTop: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.text,
    alignItems: 'center',
  },
  presionado: {
    opacity: 0.7,
  },
  anuncioLabel: {
    fontFamily: Fonts.medium,
    fontSize: 21,
    color: Colors.text,
  },
  salir: {
    fontFamily: Fonts.medium,
    fontSize: 21,
    color: Colors.accent,
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  visibleBox: {
    alignSelf: 'stretch',
    marginTop: Spacing.three,
    marginBottom: Spacing.four,
  },
  visibleFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  visibleLabel: {
    fontFamily: Fonts.medium,
    fontSize: 16,
    color: Colors.text,
  },
  visibleNota: {
    fontFamily: Fonts.light,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textMuted,
    marginTop: Spacing.one,
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
  },
  eyebrow: {
    fontFamily: Fonts.light,
    marginTop: 2,
    fontSize: 13,
    color: Colors.textMuted,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
  },
  cardContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.six,
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
  account: {
    alignItems: 'center',
  },
  accountName: {
    fontFamily: Fonts.bold,
    marginTop: Spacing.three,
    fontSize: 19,
    color: Colors.text,
  },
  badge: {
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 12.5,
    // El color lo pone cada insignia; sin este, el texto heredaba el oscuro
    // de la tarjeta blanca y sobre negro no se leía.
    color: Colors.text,
  },
  badgeRevision: {
    backgroundColor: Colors.warningBg,
  },
  badgeVerificado: {
    backgroundColor: Colors.successBg,
  },
  badgeAdmin: {
    backgroundColor: 'rgba(217,8,4,0.22)',
  },
  infoList: {
    width: '100%',
    marginTop: Spacing.five,
    gap: Spacing.three,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    paddingBottom: Spacing.two,
  },
  infoLabel: {
    fontFamily: Fonts.light,
    fontSize: 15,
    color: Colors.textMuted,
  },
  infoValue: {
    fontFamily: Fonts.medium,
    fontSize: 15,
    color: Colors.text,
  },
  actionRows: {
    width: '100%',
    marginTop: Spacing.five,
    gap: Spacing.two,
  },
  adminRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.four,
    backgroundColor: Colors.surface,
    borderRadius: 14,
  },
  adminRowPresionada: {
    backgroundColor: Colors.backgroundAlt,
  },
  adminRowLabel: {
    fontFamily: Fonts.medium,
    flex: 1,
    fontSize: 17,
    color: Colors.text,
  },
});
