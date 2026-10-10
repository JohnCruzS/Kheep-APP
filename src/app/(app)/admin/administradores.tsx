import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Texto';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CambiarClave } from '@/components/admin/CambiarClave';
import { AccionRoja, FilaDato, FilaInterruptor, NotaRoja, TarjetaDesplegable } from '@/components/admin/TarjetaDesplegable';
import { ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Interruptor } from '@/components/ui/Interruptor';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import {
  AdminZona,
  PermisoZona,
  asignarAdminZona,
  cambiarClaveAdminZona,
  cambiarMiClave,
  listarAdminsZona,
  pausarAdminZona,
  quitarAdminZona,
} from '@/lib/administradores';
import { comunasEnMemoria, precargarComunas } from '@/lib/cacheAdmin';
import type { ComunaAdmin } from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { REJILLA, u } from '@/lib/rejilla';
import { nombreRegion } from '@/lib/regiones';
import { useSession } from '@/providers/SessionProvider';

/** Los permisos con el nombre corto de la maqueta del cliente. */
const PERMISOS: { clave: PermisoZona; nombre: string }[] = [
  { clave: 'moderar', nombre: 'Aprobación' },
  { clave: 'categorias', nombre: 'Categorías' },
  { clave: 'publicaciones', nombre: 'Eliminación' },
  { clave: 'banners', nombre: 'Banners' },
  { clave: 'suspender', nombre: 'Suspensión' },
];

/** Clave de la tarjeta de la propia cuenta (la del administrador general). */
const MI_CUENTA = '__mi_cuenta__';

/**
 * Admins (maqueta del cliente): una tarjeta por cuenta que se abre y se
 * cierra, una a la vez.
 *
 *  - "Administración": la cuenta del administrador general, con su correo y
 *    "Cambiar clave" (las claves se guardan cifradas: no se pueden ver).
 *  - Cada administrador de zona: abierto muestra su interruptor (pausarlo sin
 *    quitarlo), su zona —se toca para cambiarla—, su correo, sus permisos con
 *    un interruptor cada uno, "Cambiar clave" y "Quitar".
 *
 * Los cambios de permisos y de pausa se guardan al tocar el interruptor.
 * Solo la ve el administrador general (se llega desde su panel).
 */
export default function AdministradoresScreen() {
  const router = useRouter();
  const { session, profile } = useSession();
  const [lista, setLista] = useState<AdminZona[]>([]);
  const [comunas, setComunas] = useState<ComunaAdmin[]>(() => comunasEnMemoria() ?? []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  /** De quién se está cambiando la clave (MI_CUENTA = la propia). */
  const [cambiandoClave, setCambiandoClave] = useState<{ id: string; nombre: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [admins, listaComunas] = await Promise.all([listarAdminsZona(), precargarComunas().catch(() => null)]);
      setLista(admins);
      if (listaComunas) setComunas(listaComunas);
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

  /** "Santiago · Valparaíso · Calama": sus regiones completas y sus comunas sueltas. */
  function zonaDe(admin: AdminZona): string {
    const nombres = [
      ...admin.regiones.map(nombreRegion),
      ...admin.comunas.map((id) => comunas.find((c) => c.id === id)?.nombre).filter((n): n is string => !!n),
    ];
    return nombres.length > 0 ? nombres.join(' · ') : 'sin zona';
  }

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

  function alternarPermiso(admin: AdminZona, clave: PermisoZona) {
    const permisos = admin.permisos.includes(clave)
      ? admin.permisos.filter((p) => p !== clave)
      : [...admin.permisos, clave];
    if (permisos.length === 0) {
      Alert.alert('Al menos un permiso', 'Un administrador necesita al menos un permiso. Si no debe hacer nada, páusalo o quítalo.');
      return;
    }
    void cambiar(admin, { permisos }, () =>
      asignarAdminZona({ usuarioId: admin.usuarioId, permisos, regiones: admin.regiones, comunas: admin.comunas }),
    );
  }

  function quitar(admin: AdminZona) {
    Alert.alert(
      'Quitar administrador',
      `${admin.nombre} deja de ser administrador y vuelve a ser una cuenta normal. Su cuenta no se borra.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: async () => {
            try {
              await quitarAdminZona(admin.usuarioId);
              setLista((l) => l.filter((a) => a.usuarioId !== admin.usuarioId));
            } catch (err) {
              Alert.alert('No se pudo quitar', getErrorMessage(err, 'Intenta de nuevo.'));
            }
          },
        },
      ],
    );
  }

  const alternar = (id: string) => setAbierta((a) => (a === id ? null : id));

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <EncabezadoMarca subtitulo="Admin" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* La cuenta propia: la del administrador general. */}
        <TarjetaDesplegable titulo="Administración" abierta={abierta === MI_CUENTA} onAlternar={() => alternar(MI_CUENTA)}>
          <FilaDato etiqueta="Correo" valor={session?.user?.email ?? '—'} />
          <AccionRoja
            texto="Cambiar clave"
            onPress={() => setCambiandoClave({ id: MI_CUENTA, nombre: profile?.nombre ?? 'Tu cuenta' })}
          />
        </TarjetaDesplegable>

        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={load} />}

        {!loading && !error && lista.length === 0 && (
          <Text style={styles.vacio}>
            Todavía no hay administradores de zona. Crea uno con “Nuevo” y asígnale sus comunas o regiones.
          </Text>
        )}

        {lista.map((admin) => (
          <TarjetaDesplegable
            key={admin.usuarioId}
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
            {/* Tocar la zona abre la pantalla para cambiar sus regiones y comunas. */}
            <NotaRoja
              texto={`zona – ${zonaDe(admin)}`}
              onPress={() => router.push({ pathname: '/(app)/admin/administrador', params: { id: admin.usuarioId } })}
            />
            <FilaDato etiqueta="Correo" valor={admin.email} />
            {PERMISOS.map((permiso) => (
              <FilaInterruptor
                key={permiso.clave}
                etiqueta={permiso.nombre}
                valor={admin.permisos.includes(permiso.clave)}
                onCambio={() => alternarPermiso(admin, permiso.clave)}
              />
            ))}
            <AccionRoja texto="Cambiar clave" onPress={() => setCambiandoClave({ id: admin.usuarioId, nombre: admin.nombre })} />
            <AccionRoja texto="Quitar" onPress={() => quitar(admin)} />
          </TarjetaDesplegable>
        ))}
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

      <CambiarClave
        visible={cambiandoClave !== null}
        para={cambiandoClave?.nombre ?? ''}
        onCerrar={() => setCambiandoClave(null)}
        onGuardar={async (clave) => {
          if (!cambiandoClave) return;
          if (cambiandoClave.id === MI_CUENTA) await cambiarMiClave(clave);
          else await cambiarClaveAdminZona(cambiandoClave.id, clave);
          Alert.alert('Clave cambiada', 'La nueva clave ya funciona para entrar.');
        }}
      />
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
  nuevo: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  nuevoLabel: {
    fontFamily: Fonts.delgada,
    fontSize: 30,
    color: Colors.accent,
  },
});
