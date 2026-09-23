import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SelectorComuna } from '@/components/admin/SelectorComuna';
import { LoadingState } from '@/components/catalog/CatalogState';
import { Button } from '@/components/ui/Button';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { FormScroll } from '@/components/ui/FormScroll';
import { TextField } from '@/components/ui/TextField';
import { Interruptor } from '@/components/ui/Interruptor';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import {
  PERMISOS_ZONA,
  PermisoZona,
  asignarAdminZona,
  crearCuentaAdministrador,
  listarAdminsZona,
  quitarAdminZona,
} from '@/lib/administradores';
import { ComunaAdmin, fetchComunasAdmin } from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { REJILLA, u } from '@/lib/rejilla';
import { isValidEmail } from '@/lib/validation';
import { compararRegiones, nombreRegion } from '@/lib/regiones';

const sinPrefijo = nombreRegion;

/**
 * Crear o editar un administrador de zona.
 *
 * Al crear se escriben los datos de la cuenta nueva (nombre, correo y
 * contraseña); si el correo ya tiene cuenta, se asciende esa en vez de crear
 * otra. Al editar solo se cambian la zona y los permisos.
 *
 * La zona se arma con regiones completas y/o comunas sueltas: una región
 * cubre todas sus comunas, también las que se agreguen después.
 */
export default function AdministradorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editando = Boolean(id);

  const [comunas, setComunas] = useState<ComunaAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regiones, setRegiones] = useState<string[]>([]);
  const [comunasElegidas, setComunasElegidas] = useState<string[]>([]);
  const [permisos, setPermisos] = useState<PermisoZona[]>([]);
  const [eligiendoComuna, setEligiendoComuna] = useState(false);
  const [verRegiones, setVerRegiones] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const lista = await fetchComunasAdmin();
        setComunas(lista);
        if (id) {
          const admin = (await listarAdminsZona()).find((a) => a.usuarioId === id);
          if (admin) {
            setNombre(admin.nombre);
            setEmail(admin.email);
            setRegiones(admin.regiones);
            setComunasElegidas(admin.comunas);
            setPermisos(admin.permisos);
          }
        }
      } catch (err) {
        setError(getErrorMessage(err, 'No se pudo cargar.'));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const todasLasRegiones = useMemo(() => [...new Set(comunas.map((c) => c.region))].sort(compararRegiones), [comunas]);
  const nombreDe = (comunaId: string) => comunas.find((c) => c.id === comunaId)?.nombre ?? 'Comuna';

  function alternar<T>(lista: T[], valor: T): T[] {
    return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
  }

  async function handleGuardar() {
    setError(null);
    if (!editando) {
      if (nombre.trim().length === 0) return setError('Escribe el nombre del administrador.');
      if (!isValidEmail(email)) return setError('Escribe un correo válido.');
      if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    }
    if (regiones.length === 0 && comunasElegidas.length === 0) {
      return setError('Asígnale al menos una región o una comuna.');
    }
    if (permisos.length === 0) return setError('Dale al menos un permiso.');

    setGuardando(true);
    try {
      let usuarioId = id ?? '';
      let aviso = 'Los cambios quedaron guardados.';

      if (!editando) {
        const cuenta = await crearCuentaAdministrador({ nombre, email, password });
        usuarioId = cuenta.usuarioId;
        aviso = cuenta.yaExistia
          ? `${email} ya tenía cuenta, así que se convirtió esa en administrador. Entra con su contraseña de siempre.`
          : `Cuenta creada. ${nombre.trim()} ya puede entrar con ${email.trim()} y la contraseña que escribiste.`;
      }

      await asignarAdminZona({ usuarioId, permisos, regiones, comunas: comunasElegidas });
      Alert.alert(editando ? 'Guardado' : 'Administrador creado', aviso, [
        { text: 'Listo', onPress: () => router.back() },
      ]);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo guardar el administrador.'));
    } finally {
      setGuardando(false);
    }
  }

  function handleQuitar() {
    if (!id) return;
    Alert.alert(
      'Quitar administrador',
      `${nombre} deja de ser administrador y vuelve a ser una cuenta normal. Su cuenta no se borra.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: async () => {
            try {
              await quitarAdminZona(id);
              router.back();
            } catch (err) {
              setError(getErrorMessage(err, 'No se pudo quitar el administrador.'));
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <EncabezadoMarca subtitulo={editando ? 'Editar administrador' : 'Nuevo administrador'} onVolver={() => router.back()} />

      {loading ? (
        <LoadingState />
      ) : (
        <FormScroll contentContainerStyle={styles.content}>
          {/* La cuenta: solo al crear. Al editar se muestra quién es. */}
          {editando ? (
            <View style={styles.quien}>
              <Text style={styles.quienNombre}>{nombre}</Text>
              <Text style={styles.quienCorreo}>{email}</Text>
            </View>
          ) : (
            <>
              <TextField label="Nombre" value={nombre} onChangeText={setNombre} autoCapitalize="words" />
              <TextField
                label="Correo"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TextField
                label="Contraseña"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                hint="Mínimo 6 caracteres. Si el correo ya tiene cuenta, se usa la suya."
              />
            </>
          )}

          {/* ---------------------------------------------------- zona */}
          <Text style={styles.seccion}>Zona</Text>

          <Pressable style={styles.bloque} onPress={() => setVerRegiones((v) => !v)}>
            <Text style={styles.bloqueTitulo}>Regiones completas</Text>
            <Text style={styles.bloqueValor}>{regiones.length > 0 ? regiones.map(sinPrefijo).join(', ') : 'Ninguna'}</Text>
          </Pressable>
          {verRegiones &&
            todasLasRegiones.map((region) => (
              <View key={region} style={styles.opcion}>
                <Text style={styles.opcionLabel}>{sinPrefijo(region)}</Text>
                <Interruptor
                  value={regiones.includes(region)}
                  onValueChange={() => setRegiones((r) => alternar(r, region))}
                />
              </View>
            ))}

          <View style={[styles.bloque, styles.bloqueComunas]}>
            <Text style={styles.bloqueTitulo}>Comunas sueltas</Text>
            {comunasElegidas.length === 0 && <Text style={styles.bloqueValor}>Ninguna</Text>}
            {comunasElegidas.map((comunaId) => (
              <View key={comunaId} style={styles.chip}>
                <Text style={styles.chipLabel}>{nombreDe(comunaId)}</Text>
                <Pressable onPress={() => setComunasElegidas((c) => c.filter((x) => x !== comunaId))} hitSlop={10}>
                  <Text style={styles.chipQuitar}>✕</Text>
                </Pressable>
              </View>
            ))}
            <Pressable onPress={() => setEligiendoComuna(true)} style={styles.agregar} hitSlop={8}>
              <Text style={styles.agregarLabel}>+ Agregar comuna</Text>
            </Pressable>
          </View>

          {/* ------------------------------------------------ permisos */}
          <Text style={styles.seccion}>Permisos</Text>
          {PERMISOS_ZONA.map((permiso) => (
            <View key={permiso.clave} style={styles.opcion}>
              <View style={styles.opcionTexto}>
                <Text style={styles.opcionLabel}>{permiso.nombre}</Text>
                <Text style={styles.opcionDetalle}>{permiso.detalle}</Text>
              </View>
              <Interruptor
                value={permisos.includes(permiso.clave)}
                onValueChange={() => setPermisos((p) => alternar(p, permiso.clave))}
              />
            </View>
          ))}

          {error && <Text style={styles.error}>{error}</Text>}

          <Button label={guardando ? 'Guardando…' : 'Guardar'} onPress={handleGuardar} loading={guardando} />

          {editando && (
            <Pressable style={styles.quitar} onPress={handleQuitar} hitSlop={10}>
              <Text style={styles.quitarLabel}>Quitar como administrador</Text>
            </Pressable>
          )}
        </FormScroll>
      )}

      <SelectorComuna
        visible={eligiendoComuna}
        titulo="Agregar a su zona"
        comunas={comunas.filter((c) => !comunasElegidas.includes(c.id))}
        onClose={() => setEligiendoComuna(false)}
        onElegir={(comunaId) => {
          setEligiendoComuna(false);
          if (comunaId) setComunasElegidas((c) => [...c, comunaId]);
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
    paddingHorizontal: u(REJILLA.margenLateral) + Spacing.two,
    paddingBottom: Spacing.six,
  },
  quien: {
    alignItems: 'center',
    marginTop: Spacing.three,
  },
  quienNombre: {
    fontFamily: Fonts.medium,
    fontSize: 21,
    color: Colors.text,
  },
  quienCorreo: {
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 2,
  },
  seccion: {
    fontFamily: Fonts.light,
    fontSize: 21,
    color: Colors.accent,
    marginTop: Spacing.five,
    marginBottom: Spacing.two,
  },
  bloque: {
    backgroundColor: Colors.surface,
    borderRadius: u(REJILLA.curvatura),
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
  bloqueComunas: {
    gap: Spacing.two,
  },
  bloqueTitulo: {
    fontFamily: Fonts.medium,
    fontSize: 16,
    color: Colors.text,
  },
  bloqueValor: {
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  chipLabel: {
    fontFamily: Fonts.light,
    fontSize: 15,
    color: Colors.text,
  },
  chipQuitar: {
    fontFamily: Fonts.medium,
    fontSize: 15,
    color: Colors.textMuted,
  },
  agregar: {
    paddingVertical: Spacing.two,
  },
  agregarLabel: {
    fontFamily: Fonts.medium,
    fontSize: 15,
    color: Colors.accent,
  },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  opcionTexto: {
    flex: 1,
  },
  opcionLabel: {
    fontFamily: Fonts.light,
    fontSize: 17,
    color: Colors.text,
  },
  opcionDetalle: {
    fontFamily: Fonts.light,
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  error: {
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.danger,
    marginTop: Spacing.three,
  },
  quitar: {
    alignItems: 'center',
    marginTop: Spacing.four,
  },
  quitarLabel: {
    fontFamily: Fonts.medium,
    fontSize: 16,
    color: Colors.danger,
  },
});

