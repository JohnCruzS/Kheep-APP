import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Texto';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CambiarClave } from '@/components/admin/CambiarClave';
import { AccionRoja, FilaCredenciales, FilaInterruptor, NotaRoja, TarjetaDesplegable } from '@/components/admin/TarjetaDesplegable';
import { CambiarCorreo } from '@/components/admin/CambiarCorreo';
import { CambiarNombre } from '@/components/admin/CambiarNombre';
import { AvisoCambio } from '@/components/admin/AvisoCambio';
import { ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Interruptor } from '@/components/ui/Interruptor';
import { ListaArrastrable, type PropsMantener } from '@/components/ui/ListaArrastrable';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import {
  AdminZona,
  GRUPOS_PERMISOS,
  GrupoPermisos,
  alternarGrupo,
  asignarAdminZona,
  grupoActivo,
  cambiarClaveAdminZona,
  cambiarCorreoAdmin,
  cambiarMiClave,
  listarAdminsZona,
  ordenarAdminsZona,
  pausarAdminZona,
} from '@/lib/administradores';
import { actualizarNombrePerfil, eliminarPerfil } from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { SEPARACION_TARJETA, useAltoTarjeta } from '@/lib/altoTarjeta';
import { REJILLA, u } from '@/lib/rejilla';
import { useSession } from '@/providers/SessionProvider';

/**
 * Medidas de la maqueta del cliente, en la rejilla de 1000 del ancho:
 * cada tarjeta cerrada mide 240 de alto; entre "Administración" y el primer
 * admin van 2 márgenes laterales, y entre un admin y otro, 1.
 */
const MARGEN = SEPARACION_TARJETA;

/** Clave de la tarjeta de la propia cuenta (la del administrador general). */
const MI_CUENTA = '__mi_cuenta__';

/**
 * Admins (maqueta del cliente): una tarjeta por cuenta que se abre y se
 * cierra, una a la vez.
 *
 *  - "Administración": la cuenta del administrador general, con su correo y
 *    contraseña: tocar el correo lo cambia, y tocar "Correo" muestra
 *    "Contraseña XXXXXXXX" para cambiarla (se guarda cifrada: no se ve).
 *  - Cada administrador de zona: abierto muestra su interruptor (pausarlo sin
 *    quitarlo), su zona —se toca para cambiarla—, su correo, sus permisos con
 *    un interruptor cada uno, correo/contraseña como arriba y "Eliminar" (borra la cuenta
 *    por completo).
 *
 * Los cambios de permisos y de pausa se guardan al tocar el interruptor.
 * Solo la ve el administrador general (se llega desde su panel).
 */
export default function AdministradoresScreen() {
  const router = useRouter();
  const { session, profile } = useSession();
  /** El alto de las tarjetas del panel del admin: todas las listas miden igual. */
  const ALTO_TARJETA = useAltoTarjeta();
  const [lista, setLista] = useState<AdminZona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  /** De quién se está cambiando la clave (MI_CUENTA = la propia). */
  const [cambiandoClave, setCambiandoClave] = useState<{ id: string; nombre: string } | null>(null);
  /** De quién se está cambiando el correo (MI_CUENTA = el propio). */
  const [cambiandoCorreo, setCambiandoCorreo] = useState<{ id: string; nombre: string; actual: string } | null>(null);
  /** El correo propio: el de la sesión, o el recién cambiado. */
  const [miCorreo, setMiCorreo] = useState<string | null>(null);
  /** A quién se le está cambiando el nombre (se abre manteniendo apretado el nombre). */
  const [renombrando, setRenombrando] = useState<AdminZona | null>(null);
  /** El aviso "Cambio realizado!" tras cambiar una contraseña. */
  const [avisoCambio, setAvisoCambio] = useState(false);
  const correoPropio = miCorreo ?? session?.user?.email ?? '';

  const load = useCallback(async () => {
    setError(null);
    try {
      setLista(await listarAdminsZona());
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudieron cargar los administradores.'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Al volver de crear uno o de cambiarle la zona, la lista se actualiza.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /** Cambia algo de un admin en pantalla al tiro y lo guarda; si falla, vuelve atrás. */
  async function cambiar(admin: AdminZona, cambio: Partial<AdminZona>, guardar: () => Promise<void>) {
    setLista((l) => l.map((a) => (a.usuarioId === admin.usuarioId ? { ...a, ...cambio } : a)));
    try {
      await guardar();
    } catch (err) {
      setLista((l) => l.map((a) => (a.usuarioId === admin.usuarioId ? admin : a)));
      Alert.alert('No se pudo guardar', getErrorMessage(err, 'Intenta de nuevo.'));
    }
  }

  function alternarPermiso(admin: AdminZona, grupo: GrupoPermisos) {
    const permisos = alternarGrupo(admin.permisos, grupo);
    if (permisos.length === 0) {
      Alert.alert('Al menos un permiso', 'Un administrador necesita al menos un permiso. Si no debe hacer nada, páusalo o elimínalo.');
      return;
    }
    void cambiar(admin, { permisos }, () =>
      asignarAdminZona({ usuarioId: admin.usuarioId, permisos, regiones: admin.regiones, comunas: admin.comunas }),
    );
  }

  /**
   * Elimina la cuenta del administrador por completo (pedido del cliente):
   * no vuelve a ser una cuenta normal, se borra con todo lo suyo. Va en dos
   * pasos porque no se puede deshacer.
   */
  function eliminar(admin: AdminZona) {
    Alert.alert(
      'Eliminar administrador',
      `Se borrará la cuenta de ${admin.nombre} (${admin.email}) por completo: ya no podrá entrar y se pierde todo lo suyo. No se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () =>
            Alert.alert('¿Seguro?', `La cuenta de ${admin.nombre} se elimina para siempre.`, [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Eliminar cuenta',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await eliminarPerfil(admin.usuarioId);
                    setLista((l) => l.filter((a) => a.usuarioId !== admin.usuarioId));
                    setAbierta(null);
                  } catch (err) {
                    Alert.alert('No se pudo eliminar', getErrorMessage(err, 'Intenta de nuevo.'));
                  }
                },
              },
            ]),
        },
      ],
    );
  }

  const alternar = (id: string) => setAbierta((a) => (a === id ? null : id));
  /** Ninguna tarjeta de admin abierta (la de la propia cuenta no cuenta): se puede arrastrar. */
  const ningunaAbierta = abierta === null || abierta === MI_CUENTA;
  /** Mientras se mueve una tarjeta, la pantalla no se desplaza bajo el dedo. */
  const [arrastrando, setArrastrando] = useState(false);

  /** Al soltar: el orden nuevo en pantalla al tiro, y se guarda. */
  async function reordenar(nuevos: AdminZona[]) {
    const anterior = lista;
    setLista(nuevos);
    try {
      await ordenarAdminsZona(nuevos.map((a) => a.usuarioId));
    } catch (err) {
      setLista(anterior);
      Alert.alert('No se pudo guardar el orden', getErrorMessage(err, 'Intenta de nuevo.'));
    }
  }

  /** La tarjeta de un admin de zona; `mantener` = agarrarla para moverla. */
  function tarjetaDe(admin: AdminZona, mantener?: PropsMantener) {
    return (
      <TarjetaDesplegable
        alto={ALTO_TARJETA}
        separacion={MARGEN}
        mantener={mantener}
        onMantenerTitulo={() => setRenombrando(admin)}
        titulo={admin.nombre}
        abierta={abierta === admin.usuarioId}
        onAlternar={() => alternar(admin.usuarioId)}
        derecha={
          <Interruptor
            value={admin.activo}
            onValueChange={(activo) =>
              void cambiar(admin, { activo }, () => pausarAdminZona(admin.usuarioId, activo))
            }
            accessibilityLabel={admin.activo ? `Pausar a ${admin.nombre}` : `Activar a ${admin.nombre}`}
          />
        }>
        {!admin.activo && <Text style={styles.pausado}>Pausado: no puede hacer nada en el panel.</Text>}
        {/* Solo "Ubicación": al tocarlo se ve la lista con sus zonas activadas. */}
        <NotaRoja
          texto="Ubicación"
          onPress={() => router.push({ pathname: '/(app)/admin/administrador', params: { id: admin.usuarioId } })}
        />
        {/* Tocar el correo lo cambia; tocar "Correo" muestra la contraseña (XXXXXXXX) para cambiarla. */}
        <FilaCredenciales
          correo={admin.email}
          onCambiarCorreo={() => setCambiandoCorreo({ id: admin.usuarioId, nombre: admin.nombre, actual: admin.email })}
          onCambiarClave={() => setCambiandoClave({ id: admin.usuarioId, nombre: admin.nombre })}
        />
        {/* Las tres atribuciones (solo el nombre, sin el detalle). */}
        {GRUPOS_PERMISOS.map((grupo) => (
          <FilaInterruptor
            key={grupo.id}
            etiqueta={grupo.nombre}
            valor={grupoActivo(admin.permisos, grupo)}
            onCambio={() => alternarPermiso(admin, grupo)}
          />
        ))}
        <AccionRoja texto="Eliminar" onPress={() => eliminar(admin)} />
      </TarjetaDesplegable>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <EncabezadoMarca subtitulo="Admin" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!arrastrando}>
        {/* La cuenta propia: la del administrador general. */}
        <TarjetaDesplegable
          titulo="Administración"
          abierta={abierta === MI_CUENTA}
          onAlternar={() => alternar(MI_CUENTA)}
          alto={ALTO_TARJETA}
          separacion={MARGEN}>
          <FilaCredenciales
            correo={correoPropio || '—'}
            onCambiarCorreo={() =>
              setCambiandoCorreo({ id: MI_CUENTA, nombre: profile?.nombre ?? 'Tu cuenta', actual: correoPropio })
            }
            onCambiarClave={() => setCambiandoClave({ id: MI_CUENTA, nombre: profile?.nombre ?? 'Tu cuenta' })}
          />
        </TarjetaDesplegable>

        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && lista.length === 0 && (
          <Text style={styles.vacio}>
            Todavía no hay administradores de zona. Crea uno con “Nuevo” y asígnale sus comunas o regiones.
          </Text>
        )}

        {/* Cerradas todas, se ordenan manteniendo apretada la caja (fuera del
            nombre) y arrastrando; mantener apretado el NOMBRE es para
            cambiarlo. Con una abierta la lista queda quieta (las tarjetas
            miden distinto y el arrastre necesita filas iguales). */}
        {ningunaAbierta ? (
          <ListaArrastrable
            datos={lista}
            altoFila={ALTO_TARJETA + MARGEN}
            claveDe={(admin) => admin.usuarioId}
            onReordenar={reordenar}
            onArrastrando={setArrastrando}>
            {(admin, _indice, arrastrando, _propsAsa, propsMantener) => (
              <View style={arrastrando && styles.arrastrando}>{tarjetaDe(admin, propsMantener)}</View>
            )}
          </ListaArrastrable>
        ) : (
          lista.map((admin) => <View key={admin.usuarioId}>{tarjetaDe(admin)}</View>)
        )}
        {/* "Nuevo" en texto rojo, debajo del último perfil (no fijo encima de
            la lista): se desplaza con ella. */}
        {!loading && (
          <Pressable
            style={styles.nuevo}
            onPress={() => router.push('/(app)/admin/administrador')}
            hitSlop={10}
            accessibilityRole="button">
            <Text style={styles.nuevoLabel}>Nuevo</Text>
          </Pressable>
        )}
      </ScrollView>

      <CambiarNombre
        visible={renombrando !== null}
        actual={renombrando?.nombre ?? ''}
        onCerrar={() => setRenombrando(null)}
        onGuardar={async (nombre) => {
          if (!renombrando) return;
          await actualizarNombrePerfil(renombrando.usuarioId, nombre);
          setLista((l) => l.map((a) => (a.usuarioId === renombrando.usuarioId ? { ...a, nombre } : a)));
        }}
      />

      <CambiarCorreo
        visible={cambiandoCorreo !== null}
        para={cambiandoCorreo?.nombre ?? ''}
        actual={cambiandoCorreo?.actual ?? ''}
        onCerrar={() => setCambiandoCorreo(null)}
        onGuardar={async (correo) => {
          if (!cambiandoCorreo) return;
          if (cambiandoCorreo.id === MI_CUENTA) {
            const id = session?.user?.id;
            if (!id) throw new Error('No hay sesión iniciada.');
            await cambiarCorreoAdmin(id, correo);
            setMiCorreo(correo);
          } else {
            await cambiarCorreoAdmin(cambiandoCorreo.id, correo);
            setLista((l) => l.map((a) => (a.usuarioId === cambiandoCorreo.id ? { ...a, email: correo } : a)));
          }
          Alert.alert('Correo cambiado', `Desde ahora entra con ${correo}. La clave sigue siendo la misma.`);
        }}
      />

      <CambiarClave
        visible={cambiandoClave !== null}
        para={cambiandoClave?.nombre ?? ''}
        onCerrar={() => setCambiandoClave(null)}
        onGuardar={async (clave) => {
          if (!cambiandoClave) return;
          if (cambiandoClave.id === MI_CUENTA) await cambiarMiClave(clave);
          else await cambiarClaveAdminZona(cambiandoClave.id, clave);
          setAvisoCambio(true);
        }}
      />

      <AvisoCambio visible={avisoCambio} onCerrar={() => setAvisoCambio(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingBottom: Spacing.four,
  },
  vacio: {
    fontFamily: Fonts.delgada,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.four,
    paddingHorizontal: Spacing.four,
  },
  pausado: {
    fontFamily: Fonts.delgada,
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  // La tarjeta que se está moviendo, apenas atenuada.
  arrastrando: {
    opacity: 0.85,
  },
  nuevo: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  // Poppins Light en rojo, del mismo tamaño que "Salir" del panel.
  nuevoLabel: {
    fontFamily: Fonts.delgada,
    fontSize: 25,
    color: Colors.accent,
  },
});
