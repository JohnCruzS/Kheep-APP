import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { SuspenderCuenta } from '@/components/admin/SuspenderCuenta';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Interruptor as Palanca } from '@/components/ui/Interruptor';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import {
  FichaUsuario,
  PublicacionDeUsuario,
  actualizarNivelPerfil,
  actualizarVisibilidadPerfil,
  aprobarPublicacion,
  darDeBajaPublicacion,
  reactivarCuenta,
  eliminarPerfil,
  eliminarPublicacionesDePerfil,
  fetchFichaUsuario,
  fetchPublicacionesDeUsuario,
  rechazarPublicacion,
} from '@/lib/catalog';
import { puede } from '@/lib/administradores';
import { getErrorMessage } from '@/lib/errors';
import { useSession } from '@/providers/SessionProvider';
import { REJILLA, u } from '@/lib/rejilla';

/**
 * Todo lo de un usuario en un solo lugar: se llega tocándolo en la lista de
 * una categoría (Comunas → comuna → categoría → usuario).
 *
 * Lo que aquí se ve no depende de la comuna por la que se entró: sus
 * publicaciones y pendientes son las de todas las comunas, porque ocultar o
 * dar libre publicación también vale para todas.
 */
export default function FichaUsuarioScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { permisos } = useSession();
  const esGeneral = permisos?.esGeneral ?? false;

  const [ficha, setFicha] = useState<FichaUsuario | null>(null);
  const [publicaciones, setPublicaciones] = useState<PublicacionDeUsuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [suspendiendo, setSuspendiendo] = useState(false);
  /** Publicación que se está aprobando o rechazando, para no tocarla dos veces. */
  const [moderando, setModerando] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [datos, lista] = await Promise.all([fetchFichaUsuario(id), fetchPublicacionesDeUsuario(id)]);
      setFicha(datos);
      setPublicaciones(lista);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo cargar el usuario.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Al volver de ver una publicación se recarga: pudo cambiar algo.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /** Cambio inmediato en pantalla; si la base lo rechaza, se deshace. */
  async function cambiar(parcial: Partial<FichaUsuario>, guardar: () => Promise<void>, mensajeError: string) {
    if (!ficha) return;
    const antes = ficha;
    setFicha({ ...ficha, ...parcial });
    setAviso(null);
    try {
      await guardar();
    } catch (err) {
      setFicha(antes);
      setError(getErrorMessage(err, mensajeError));
    }
  }

  async function moderar(publicacion: PublicacionDeUsuario, aprobar: boolean) {
    setModerando(publicacion.id);
    try {
      await (aprobar ? aprobarPublicacion(publicacion.id) : rechazarPublicacion(publicacion.id));
      const estado = aprobar ? 'aprobado' : 'rechazado';
      setPublicaciones((lista) => lista.map((p) => (p.id === publicacion.id ? { ...p, estado } : p)));
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo moderar la publicación.'));
    } finally {
      setModerando(null);
    }
  }

  function handleEliminar() {
    if (!ficha) return;
    Alert.alert(`Eliminar “${ficha.nombre}”`, '¿Qué quieres eliminar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sus publicaciones',
        onPress: async () => {
          try {
            const borradas = await eliminarPublicacionesDePerfil(ficha.id);
            setAviso(`Se eliminaron ${borradas} publicaciones. La cuenta sigue activa.`);
            await load();
          } catch (err) {
            setError(getErrorMessage(err, 'No se pudieron eliminar las publicaciones.'));
          }
        },
      },
      {
        text: 'La cuenta',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            'Eliminar la cuenta',
            `Se borrará la cuenta de ${ficha.nombre} con todas sus publicaciones. No se puede deshacer.\n\n` +
              'Si solo quieres que deje de verse, cancela y usa “Visible en el catálogo”.',
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Eliminar cuenta',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await eliminarPerfil(ficha.id);
                    router.back();
                  } catch (err) {
                    setError(getErrorMessage(err, 'No se pudo eliminar la cuenta.'));
                  }
                },
              },
            ],
          ),
      },
    ]);
  }

  // El de zona ve solo lo de sus comunas: lo demás no le corresponde.
  const propias = esGeneral ? publicaciones : publicaciones.filter((p) => permisos?.comunas.includes(p.comuna_id ?? ''));
  const propiasDeZona = propias;
  const pendientes = propias.filter((p) => p.estado === 'pendiente');
  const resto = propias.filter((p) => p.estado !== 'pendiente');

  function handleDarDeBaja(publicacion: PublicacionDeUsuario) {
    Alert.alert(
      'Dar de baja',
      `“${publicacion.titulo}” deja de verse en el catálogo. Se puede recuperar durante 6 meses.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Dar de baja',
          style: 'destructive',
          onPress: async () => {
            try {
              await darDeBajaPublicacion(publicacion.id);
              setPublicaciones((lista) => lista.filter((p) => p.id !== publicacion.id));
            } catch (err) {
              setError(getErrorMessage(err, 'No se pudo dar de baja.'));
            }
          },
        },
      ],
    );
  }
  const esAdmin = ficha?.rol === 'admin';
  // Suspender: nunca a un administrador general; a uno de zona, solo el
  // general; y el de zona, solo a quien publica en sus comunas. La base
  // vuelve a comprobar todo esto (0029).
  const puedeSuspender =
    !!ficha &&
    ficha.rol !== 'admin' &&
    (esGeneral || (ficha.rol !== 'admin_zona' && puede(permisos, 'suspender') && propiasDeZona.length > 0));

  function handleReactivar() {
    if (!ficha) return;
    Alert.alert('Reactivar cuenta', `${ficha.nombre} vuelve a poder entrar y sus publicaciones se ven otra vez.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Reactivar',
        onPress: async () => {
          try {
            await reactivarCuenta(ficha.id);
            setAviso('La cuenta está activa otra vez.');
            await load();
          } catch (err) {
            setError(getErrorMessage(err, 'No se pudo reactivar la cuenta.'));
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <EncabezadoMarca subtitulo="Usuario" onVolver={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={load} />}
        {!loading && !error && !ficha && <Text style={styles.vacio}>Este usuario ya no existe.</Text>}

        {ficha && (
          <>
            {/* Quién es */}
            <View style={styles.cabecera}>
              {ficha.logo_url ? (
                <Image source={{ uri: ficha.logo_url }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarVacio]} />
              )}
              <Text style={styles.nombre} numberOfLines={2}>
                {ficha.nombre || 'Sin nombre'}
              </Text>
              <View style={styles.insignias}>
                <Insignia
                  texto={esAdmin ? 'Administrador' : ficha.nivel === 2 ? 'Libre publicación' : 'Con revisión'}
                  tono={esAdmin || ficha.nivel === 2 ? 'ok' : 'aviso'}
                />
                <Insignia texto={ficha.activo ? 'Visible' : 'Oculto'} tono={ficha.activo ? 'ok' : 'aviso'} />
                {ficha.suspendida && <Insignia texto="Suspendida" tono="aviso" />}
              </View>
            </View>

            {aviso && <Text style={styles.aviso}>{aviso}</Text>}

            {/* Contacto */}
            <Seccion titulo="Contacto">
              <Dato
                etiqueta="Teléfono"
                valor={ficha.telefono_contacto}
                onPress={ficha.telefono_contacto ? () => Linking.openURL(`tel:${ficha.telefono_contacto}`) : undefined}
              />
              {esGeneral && (
                <Dato
                  etiqueta="Correo"
                  valor={ficha.email ?? 'Falta la migración 0024'}
                  onPress={ficha.email ? () => Linking.openURL(`mailto:${ficha.email}`) : undefined}
                />
              )}
              {/* Las fechas llegan con el correo: sin él no se sabe nada de
                  la cuenta, y "Nunca" sería mentira. */}
              {ficha.creado && (
                <>
                  <Dato etiqueta="Cuenta creada" valor={fecha(ficha.creado)} />
                  <Dato etiqueta="Último ingreso" valor={ficha.ultimoAcceso ? fecha(ficha.ultimoAcceso) : 'Nunca'} />
                </>
              )}
              <Text style={styles.nota}>
                La contraseña no se puede ver: se guarda cifrada y nadie tiene acceso a ella, ni siquiera el
                administrador.
              </Text>
            </Seccion>

            {/* Permisos */}
            {esGeneral && !esAdmin && (
              <Seccion titulo="Permisos">
                <Interruptor
                  titulo="Libre publicación"
                  detalle="Lo que publique sale directo, sin pasar por Aprobar."
                  valor={ficha.nivel === 2}
                  onCambio={(v) =>
                    cambiar(
                      { nivel: v ? 2 : 1 },
                      () => actualizarNivelPerfil(ficha.id, v ? 2 : 1),
                      'No se pudo cambiar el permiso.',
                    )
                  }
                />
                <Interruptor
                  titulo="Visible en el catálogo"
                  detalle="Oculto, ni él ni sus publicaciones aparecen en ninguna comuna."
                  valor={ficha.activo}
                  onCambio={(v) =>
                    cambiar(
                      { activo: v },
                      () => actualizarVisibilidadPerfil(ficha.id, v),
                      'No se pudo cambiar la visibilidad.',
                    )
                  }
                />
              </Seccion>
            )}

            {/* Pendientes */}
            <Seccion titulo={`Pendientes (${pendientes.length})`}>
              {pendientes.length === 0 && <Text style={styles.vacioSeccion}>Nada esperando aprobación.</Text>}
              {pendientes.map((p) => (
                <View key={p.id} style={styles.pendiente}>
                  <FilaPublicacion publicacion={p} onPress={() => verPublicacion(p.id)} />
                  {puede(permisos, 'moderar', p.comuna_id) && (
                  <View style={styles.botonesModeracion}>
                    <Pressable
                      style={[styles.botonModeracion, styles.botonRechazar]}
                      disabled={moderando === p.id}
                      onPress={() => moderar(p, false)}>
                      <Text style={styles.botonRechazarLabel}>Rechazar</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.botonModeracion, styles.botonAprobar]}
                      disabled={moderando === p.id}
                      onPress={() => moderar(p, true)}>
                      <Text style={styles.botonAprobarLabel}>Aprobar</Text>
                    </Pressable>
                  </View>
                  )}
                </View>
              ))}
            </Seccion>

            {/* Lo publicado */}
            <Seccion titulo={`Publicaciones (${resto.length})`}>
              {resto.length === 0 && <Text style={styles.vacioSeccion}>No tiene publicaciones.</Text>}
              {resto.map((p) => (
                <View key={p.id}>
                  <FilaPublicacion publicacion={p} onPress={() => verPublicacion(p.id)} />
                  {!esGeneral && puede(permisos, 'publicaciones', p.comuna_id) && (
                    <Pressable onPress={() => handleDarDeBaja(p)} hitSlop={8} style={styles.darDeBaja}>
                      <Text style={styles.darDeBajaLabel}>Dar de baja</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </Seccion>

            {/* Los botones de la cuenta van sueltos sobre el negro, uno
                debajo del otro: dentro de una tarjeta gris se veían como un
                recuadro encima de otro. A un administrador no se le ofrece
                eliminar: la base lo rechaza igual (ver 0017). */}
            {ficha.suspendida && puedeSuspender && (
              <View style={styles.datosSuspension}>
                <Dato
                  etiqueta="Suspendida"
                  valor={ficha.suspendidaHasta ? `hasta el ${fecha(ficha.suspendidaHasta)}` : 'indefinidamente'}
                />
                {ficha.suspensionMotivo && <Text style={styles.nota}>Motivo: {ficha.suspensionMotivo}</Text>}
              </View>
            )}

            {puedeSuspender && (
              <Pressable
                style={({ pressed }) => [styles.botonLleno, pressed && styles.botonLlenoPresionado]}
                onPress={ficha.suspendida ? handleReactivar : () => setSuspendiendo(true)}>
                <Text style={styles.botonLlenoLabel}>
                  {ficha.suspendida ? 'Reactivar cuenta' : 'Suspender cuenta'}
                </Text>
              </Pressable>
            )}

            {esGeneral && !esAdmin && (
              <Pressable
                style={({ pressed }) => [styles.botonBorde, pressed && styles.botonBordePresionado]}
                onPress={handleEliminar}>
                <Text style={styles.botonBordeLabel}>Eliminar cuenta</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>

      {ficha && (
        <SuspenderCuenta
          visible={suspendiendo}
          perfilId={ficha.id}
          nombre={ficha.nombre}
          onClose={() => setSuspendiendo(false)}
          onSuspendida={() => {
            setAviso('Cuenta suspendida.');
            load();
          }}
        />
      )}
    </SafeAreaView>
  );

  function verPublicacion(publicacionId: string) {
    router.push({ pathname: '/(app)/publicacion/[id]', params: { id: publicacionId } });
  }
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL');
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View style={styles.seccion}>
      <Text style={styles.seccionTitulo}>{titulo}</Text>
      <View style={styles.tarjeta}>{children}</View>
    </View>
  );
}

function Insignia({ texto, tono }: { texto: string; tono: 'ok' | 'aviso' }) {
  return (
    <View style={[styles.insignia, tono === 'ok' ? styles.insigniaOk : styles.insigniaAviso]}>
      <Text style={[styles.insigniaLabel, tono === 'ok' ? styles.insigniaLabelOk : styles.insigniaLabelAviso]}>
        {texto}
      </Text>
    </View>
  );
}

function Dato({ etiqueta, valor, onPress }: { etiqueta: string; valor: string | null; onPress?: () => void }) {
  return (
    <Pressable style={styles.dato} onPress={onPress} disabled={!onPress}>
      <Text style={styles.datoEtiqueta}>{etiqueta}</Text>
      <Text style={[styles.datoValor, onPress && styles.datoEnlace]} numberOfLines={1} selectable>
        {valor || '—'}
      </Text>
    </Pressable>
  );
}

function Interruptor({
  titulo,
  detalle,
  valor,
  onCambio,
}: {
  titulo: string;
  detalle: string;
  valor: boolean;
  onCambio: (valor: boolean) => void;
}) {
  return (
    <View style={styles.interruptor}>
      <View style={styles.interruptorTexto}>
        <Text style={styles.interruptorTitulo}>{titulo}</Text>
        <Text style={styles.interruptorDetalle}>{detalle}</Text>
      </View>
      <Palanca
        value={valor}
        onValueChange={onCambio}
      />
    </View>
  );
}

const ETIQUETA_ESTADO = { pendiente: 'Pendiente', aprobado: 'Aprobada', rechazado: 'Rechazada' } as const;

function FilaPublicacion({ publicacion, onPress }: { publicacion: PublicacionDeUsuario; onPress: () => void }) {
  const lugar = [publicacion.comuna?.nombre, publicacion.categoria?.nombre].filter(Boolean).join(' · ');
  return (
    <Pressable style={styles.publicacion} onPress={onPress}>
      {publicacion.logo_url ? (
        <Image source={{ uri: publicacion.logo_url }} style={styles.miniatura} contentFit="cover" />
      ) : (
        // Borde en vez de relleno: del mismo gris que la tarjeta no se veía.
        <View style={[styles.miniatura, styles.miniaturaVacia]} />
      )}
      <View style={styles.publicacionTexto}>
        <Text style={styles.publicacionTitulo} numberOfLines={1}>
          {publicacion.titulo}
        </Text>
        <Text style={styles.publicacionLugar} numberOfLines={1}>
          {lugar || 'Sin comuna'}
        </Text>
      </View>
      <Text
        style={[
          styles.publicacionEstado,
          publicacion.estado === 'aprobado' && styles.estadoAprobado,
          publicacion.estado === 'rechazado' && styles.estadoRechazado,
        ]}>
        {ETIQUETA_ESTADO[publicacion.estado]}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
  },
  vacio: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.four,
  },
  cabecera: {
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  avatarVacio: {
    backgroundColor: Colors.surface,
  },
  nombre: {
    fontFamily: Fonts.light,
    fontSize: 23,
    color: Colors.text,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  insignias: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  insignia: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  insigniaOk: {
    backgroundColor: Colors.successBg,
  },
  insigniaAviso: {
    backgroundColor: Colors.warningBg,
  },
  insigniaLabel: {
    fontFamily: Fonts.medium,
    fontSize: 11.5,
  },
  insigniaLabelOk: {
    color: Colors.success,
  },
  insigniaLabelAviso: {
    color: Colors.warning,
  },
  aviso: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.success,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  seccion: {
    marginTop: Spacing.four,
  },
  seccionTitulo: {
    fontFamily: Fonts.light,
    fontSize: 19,
    color: Colors.accent,
    marginBottom: Spacing.two,
  },
  tarjeta: {
    backgroundColor: Colors.surface,
    borderRadius: u(REJILLA.curvatura),
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  vacioSeccion: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.textMuted,
    paddingVertical: Spacing.two,
  },
  dato: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  datoEtiqueta: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.textMuted,
    width: 104,
  },
  datoValor: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.text,
    flex: 1,
    textAlign: 'right',
  },
  datoEnlace: {
    color: Colors.accent,
  },
  nota: {
    fontFamily: Fonts.light,
    fontSize: 11.5,
    lineHeight: 16,
    color: Colors.textMuted,
    marginTop: Spacing.one,
    marginBottom: Spacing.one,
  },
  interruptor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  interruptorTexto: {
    flex: 1,
  },
  interruptorTitulo: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.text,
  },
  interruptorDetalle: {
    fontFamily: Fonts.light,
    fontSize: 11.5,
    lineHeight: 16,
    color: Colors.textMuted,
    marginTop: 2,
  },
  pendiente: {
    paddingBottom: Spacing.two,
  },
  botonesModeracion: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  botonModeracion: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: Spacing.two,
  },
  botonRechazar: {
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  botonRechazarLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.danger,
  },
  botonAprobar: {
    backgroundColor: Colors.success,
  },
  botonAprobarLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: '#FFFFFF',
  },
  publicacion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  miniatura: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  miniaturaVacia: {
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.background,
  },
  publicacionTexto: {
    flex: 1,
  },
  publicacionTitulo: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.text,
  },
  publicacionLugar: {
    fontFamily: Fonts.light,
    fontSize: 11.5,
    color: Colors.textMuted,
    marginTop: 2,
  },
  publicacionEstado: {
    fontFamily: Fonts.medium,
    fontSize: 11.5,
    color: Colors.warning,
  },
  estadoAprobado: {
    color: Colors.success,
  },
  estadoRechazado: {
    color: Colors.danger,
  },
  /**
   * Los dos botones de la cuenta, con la misma forma y la misma altura que
   * "Nueva", "Guardar" o "Listo" del resto del panel: rectángulo con la
   * curvatura de la rejilla y un solo rojo, el de la marca.
   *
   * Relleno = la acción de la sección (suspender, o reactivar si ya está
   * suspendida). Con borde = eliminar, que no tiene vuelta atrás y por eso no
   * compite visualmente con nada.
   */
  botonLleno: {
    alignItems: 'center',
    paddingVertical: Spacing.four,
    borderRadius: u(REJILLA.curvatura),
    backgroundColor: Colors.accent,
    marginTop: Spacing.five,
  },
  botonLlenoPresionado: {
    backgroundColor: Colors.accentPressed,
  },
  botonLlenoLabel: {
    fontFamily: Fonts.medium,
    fontSize: 19,
    color: '#FFFFFF',
  },
  botonBorde: {
    alignItems: 'center',
    paddingVertical: Spacing.four,
    borderRadius: u(REJILLA.curvatura),
    borderWidth: 1,
    borderColor: Colors.accent,
    // Pegado al de arriba: los dos son de la cuenta y se leen como un par.
    marginTop: Spacing.two,
  },
  botonBordePresionado: {
    backgroundColor: 'rgba(217,8,4,0.12)',
  },
  botonBordeLabel: {
    fontFamily: Fonts.medium,
    fontSize: 19,
    color: Colors.accent,
  },
  datosSuspension: {
    marginTop: Spacing.five,
  },
  darDeBaja: {
    alignSelf: 'flex-end',
    paddingBottom: Spacing.two,
  },
  darDeBajaLabel: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: Colors.accent,
  },
});
