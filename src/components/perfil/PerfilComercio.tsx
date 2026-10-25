import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { EditorPantalla } from '@/components/admin/EditorPantalla';
import { MenuAcciones } from '@/components/admin/MenuAcciones';
import { ComunaPicker } from '@/components/catalog/ComunaPicker';
import { FotoRemota } from '@/components/ui/FotoRemota';
import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import {
  Categoria,
  Comuna,
  cambiarMiCorreo,
  cambiarMiFoto,
  cambiarMiNegocio,
  cambiarMiTelefono,
  fetchCategorias,
  fetchComunas,
  fetchMiVisibilidad,
  pausarMiPerfil,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { pickAndCompressImage, uploadCompressedImage } from '@/lib/images';
import { REJILLA, u } from '@/lib/rejilla';
import { supabase } from '@/lib/supabase';
import {
  MENSAJE_CELULAR,
  celularLocal,
  isValidChileanPhone,
  isValidEmail,
  normalizeChileanPhone,
  soloCelular,
} from '@/lib/validation';
import { useSession } from '@/providers/SessionProvider';

type Perfil = NonNullable<ReturnType<typeof useSession>['profile']>;

/** "987654321" → "9 876 543 21", como en la maqueta. */
function telefonoLegible(telefono: string | null): string {
  const d = celularLocal(telefono);
  if (d.length !== 9) return d || '—';
  return `${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
}

/**
 * El perfil del comerciante (maqueta del cliente), con la lógica de una
 * página de negocio: el comercio tiene una comuna y una categoría (giro), y
 * sus publicaciones se muestran ahí.
 *
 *  - Arriba: la foto (tocarla la cambia), el nombre, "Visible" (tocarlo lo
 *    pausa o lo vuelve a mostrar), el correo y el teléfono (tocarlos los
 *    cambia).
 *  - Abajo: la comuna (en rojo; tocarla elige otra), la categoría (botón
 *    rojo; tocarlo elige una de las de su comuna), "Mis anuncios" y "Salir".
 *
 * Las publicaciones siguen siempre al comercio (0051): al cambiar la comuna
 * o la categoría, todas se mueven a lo elegido. Al mudarse, la categoría se
 * mantiene si la nueva comuna la tiene; si no, queda vacía hasta elegirla con
 * el botón (mientras, las publicaciones esperan en "Otro"). Los 3 primeros
 * cambios son libres; después hay que esperar 7 días (lo controla la base).
 */
export function PerfilComercio({ profile, email }: { profile: Perfil; email: string | undefined }) {
  const router = useRouter();
  const { refreshProfile } = useSession();
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [editando, setEditando] = useState<'correo' | 'telefono' | null>(null);
  const [visibilidad, setVisibilidad] = useState<{ pausado: boolean; ocultoPorAdmin: boolean } | null>(null);
  const [comunas, setComunas] = useState<Comuna[]>([]);
  const [categoriasDeMiComuna, setCategoriasDeMiComuna] = useState<Categoria[]>([]);
  /** Elegir categoría: de qué comuna (la propia o la nueva a la que se cambia). */
  const [eligiendo, setEligiendo] = useState<{ comunaId: string; categorias: Categoria[] } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetchMiVisibilidad()
      .then((v) => setVisibilidad(v.disponible ? v : null))
      .catch(() => setVisibilidad(null));
    fetchComunas()
      .then(setComunas)
      .catch(() => setComunas([]));
  }, []);

  const cargarCategorias = useCallback(() => {
    if (!profile.comuna_id) return setCategoriasDeMiComuna([]);
    fetchCategorias(profile.comuna_id)
      .then(setCategoriasDeMiComuna)
      .catch(() => setCategoriasDeMiComuna([]));
  }, [profile.comuna_id]);
  useEffect(cargarCategorias, [cargarCategorias]);

  const nombreComuna = comunas.find((c) => c.id === profile.comuna_id)?.nombre ?? null;
  const nombreCategoria = categoriasDeMiComuna.find((c) => c.id === profile.categoria_id)?.nombre ?? null;

  async function cambiarFoto() {
    try {
      const foto = await pickAndCompressImage({ uso: 'logo' });
      if (!foto) return;
      setSubiendoFoto(true);
      const url = await uploadCompressedImage('logos', profile.id, foto, 'logo');
      await cambiarMiFoto(url);
      await refreshProfile();
    } catch (err) {
      Alert.alert('No se pudo cambiar la foto', getErrorMessage(err, 'Intenta de nuevo.'));
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function alternarVisible() {
    if (!visibilidad || visibilidad.ocultoPorAdmin) return;
    const antes = visibilidad;
    setVisibilidad({ ...antes, pausado: !antes.pausado });
    try {
      await pausarMiPerfil(!antes.pausado);
    } catch (err) {
      setVisibilidad(antes);
      Alert.alert('No se pudo guardar', getErrorMessage(err, 'Intenta de nuevo.'));
    }
  }

  /**
   * Elegida otra comuna: se cambia solo la comuna (la categoría se elige
   * después con su botón; si la nueva comuna tiene la de ahora, se mantiene).
   */
  function alElegirComuna(comunaId: string | null) {
    if (!comunaId || comunaId === profile.comuna_id) return;
    const destino = comunas.find((c) => c.id === comunaId)?.nombre ?? 'la nueva comuna';
    const mensaje = !profile.comuna_id
      ? `Tu comercio quedará en ${destino}. Después elige tu categoría con el botón rojo.`
      : `Tu comercio y todas tus publicaciones se mudarán a ${destino}. Si ${destino} no tiene tu categoría, elige otra con el botón rojo y tus publicaciones se moverán a ella.`;
    pedirConfirmacion(mensaje, () => cambiarMiNegocio(comunaId, null));
  }

  function alTocarCategoria() {
    if (!profile.comuna_id) {
      Alert.alert('Primero la comuna', 'Elige la comuna de tu comercio (el texto rojo de arriba).');
      return;
    }
    setEligiendo({ comunaId: profile.comuna_id, categorias: categoriasDeMiComuna });
  }

  /** Elegida una categoría con el botón rojo (de las de su comuna). */
  function confirmar(comunaId: string, categoria: Categoria) {
    if (categoria.id === profile.categoria_id) return;
    const mensaje = !profile.categoria_id
      ? `Tu categoría será ${categoria.nombre}.`
      : `Tu categoría será ${categoria.nombre} y todas tus publicaciones se moverán a ella.`;
    pedirConfirmacion(mensaje, () => cambiarMiNegocio(comunaId, categoria.id));
  }

  function pedirConfirmacion(mensaje: string, cambiar: () => Promise<void>) {
    Alert.alert('¿Confirmas el cambio?', `${mensaje}\n\nLos 3 primeros cambios son libres; después hay que esperar 7 días entre uno y otro.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cambiar',
        onPress: async () => {
          setGuardando(true);
          try {
            await cambiar();
            await refreshProfile();
          } catch (err) {
            Alert.alert('No se pudo cambiar', getErrorMessage(err, 'Intenta de nuevo.'));
          } finally {
            setGuardando(false);
          }
        },
      },
    ]);
  }

  async function salir() {
    await supabase.auth.signOut();
    router.replace('/(app)/(tabs)/dashboard');
  }

  const oculto = visibilidad?.pausado || visibilidad?.ocultoPorAdmin;

  return (
    <View style={styles.pantalla}>
      <View style={styles.arriba}>
        <Pressable onPress={cambiarFoto} disabled={subiendoFoto} accessibilityRole="imagebutton" accessibilityLabel="Cambiar foto de perfil">
          {profile.logo_url ? (
            <FotoRemota uri={profile.logo_url} ancho={FOTO} style={[styles.foto, subiendoFoto && styles.atenuado]} />
          ) : (
            <View style={[styles.foto, styles.fotoVacia, subiendoFoto && styles.atenuado]} />
          )}
        </Pressable>

        <Text style={styles.nombre} numberOfLines={1}>
          {profile.nombre}
        </Text>

        {/* "Visible": tocarlo pausa el perfil (vacaciones, sin stock…) y
            vuelve a mostrarlo. Si lo ocultó un admin, solo se avisa. */}
        {visibilidad && (
          <Pressable
            onPress={() => void alternarVisible()}
            disabled={visibilidad.ocultoPorAdmin}
            style={({ pressed }) => [styles.visible, oculto && styles.oculto, pressed && styles.atenuado]}
            accessibilityRole="switch"
            accessibilityState={{ checked: !oculto }}>
            <Text style={[styles.visibleLabel, oculto && styles.ocultoLabel]}>
              {visibilidad.ocultoPorAdmin ? 'Oculto por admin' : oculto ? 'Oculto' : 'Visible'}
            </Text>
          </Pressable>
        )}

        <Pressable onPress={() => setEditando('correo')} hitSlop={6} accessibilityRole="button" accessibilityLabel="Cambiar correo">
          <Text style={styles.correo} numberOfLines={1} adjustsFontSizeToFit>
            {email ?? '—'}
          </Text>
        </Pressable>
        <Pressable onPress={() => setEditando('telefono')} hitSlop={6} accessibilityRole="button" accessibilityLabel="Cambiar teléfono">
          <Text style={styles.telefono}>{telefonoLegible(profile.telefono_contacto)}</Text>
        </Pressable>
      </View>

      <View style={styles.abajo}>
        {/* La comuna del comercio, en rojo: tocarla elige otra. */}
        <View style={styles.centrado}>
          <ComunaPicker
            comunas={comunas}
            selectedId={profile.comuna_id}
            nombre={nombreComuna ?? 'Comuna'}
            onSelect={alElegirComuna}
            estiloEtiqueta={styles.comuna}
          />
        </View>

        <Pressable
          style={({ pressed }) => [styles.boton, styles.botonRojo, (pressed || guardando) && styles.botonRojoPresionado]}
          onPress={alTocarCategoria}
          disabled={guardando}
          accessibilityRole="button">
          <Text style={styles.botonLabel} numberOfLines={1} adjustsFontSizeToFit>
            {nombreCategoria ?? 'Categoría'}
          </Text>
        </Pressable>

        {/* "Mis anuncios": sus banners (publicarlos y verlos). */}
        <Pressable
          style={({ pressed }) => [styles.boton, styles.botonBorde, pressed && styles.atenuado]}
          onPress={() => router.push('/(app)/banner/publicar')}
          accessibilityRole="button">
          <Text style={styles.botonLabel}>Mis anuncios</Text>
        </Pressable>

        <Pressable onPress={salir} hitSlop={10} accessibilityRole="button">
          <Text style={styles.salir}>Salir</Text>
        </Pressable>
      </View>

      <MenuAcciones
        visible={eligiendo !== null}
        titulo=""
        acciones={(eligiendo?.categorias ?? []).map((c) => ({
          label: c.nombre,
          onPress: () => eligiendo && confirmar(eligiendo.comunaId, c),
        }))}
        onClose={() => setEligiendo(null)}
      />

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
        inicial={celularLocal(profile.telefono_contacto)}
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
}

const FOTO = 104;

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    justifyContent: 'space-between',
  },
  arriba: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  centrado: {
    alignItems: 'center',
  },
  foto: {
    width: FOTO,
    height: FOTO,
    borderRadius: FOTO / 2,
  },
  fotoVacia: {
    backgroundColor: '#D9D9D9',
  },
  atenuado: {
    opacity: 0.6,
  },
  nombre: {
    fontFamily: Fonts.medium,
    fontSize: 24,
    color: Colors.text,
    marginTop: Spacing.one,
  },
  // "Visible": cápsula roja; oculto, solo con borde. Medidas de la maqueta
  // del cliente (en la rejilla de 1000 de ancho): 278 × 83.
  visible: {
    width: u(278),
    height: u(83),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
  },
  oculto: {
    backgroundColor: 'transparent',
    borderColor: Colors.textMuted,
  },
  visibleLabel: {
    fontFamily: Fonts.medium,
    fontSize: u(42),
    color: '#FFFFFF',
  },
  ocultoLabel: {
    color: Colors.textMuted,
  },
  correo: {
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.text,
    marginTop: Spacing.two,
  },
  telefono: {
    fontFamily: Fonts.light,
    fontSize: 26,
    color: Colors.accent,
  },
  abajo: {
    alignItems: 'stretch',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  // La comuna, como la maqueta: texto rojo grande y centrado.
  comuna: {
    fontFamily: Fonts.medium,
    fontSize: 28,
    lineHeight: 40,
    color: Colors.accent,
    textAlign: 'center',
  },
  boton: {
    height: 64,
    borderRadius: u(REJILLA.curvatura),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  botonRojo: {
    backgroundColor: Colors.accent,
  },
  botonRojoPresionado: {
    backgroundColor: Colors.accentPressed,
  },
  botonBorde: {
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  botonLabel: {
    fontFamily: Fonts.medium,
    fontSize: 26,
    color: '#FFFFFF',
  },
  salir: {
    fontFamily: Fonts.delgada,
    fontSize: 25,
    color: Colors.accent,
    textAlign: 'center',
    marginTop: Spacing.one,
  },
});
