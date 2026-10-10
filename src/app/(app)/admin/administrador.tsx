import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Texto';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  // La zona se elige región por región: al activar una región aparecen
  // debajo sus comunas, todas encendidas, y se apagan las que no van. Una
  // región apagada no muestra sus comunas.
  //   activas:   regiones encendidas
  //   excluidas: comunas apagadas dentro de una región encendida
  const [activas, setActivas] = useState<string[]>([]);
  const [excluidas, setExcluidas] = useState<string[]>([]);
  const [permisos, setPermisos] = useState<PermisoZona[]>([]);
  const [verRegiones, setVerRegiones] = useState(false);
  /** Regiones encendidas con su lista de comunas plegada (se toca el nombre para abrir o cerrar). */
  const [plegadas, setPlegadas] = useState<string[]>([]);
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
            // Lo guardado se traduce a la pantalla: una región completa queda
            // encendida con todas sus comunas; con comunas sueltas, su región
            // queda encendida y el resto de sus comunas, apagadas.
            const regionesDeSueltas = [
              ...new Set(lista.filter((c) => admin.comunas.includes(c.id)).map((c) => c.region)),
            ].filter((r) => !admin.regiones.includes(r));
            setActivas([...admin.regiones, ...regionesDeSueltas]);
            // Al abrir un administrador que ya existe, sus regiones parten
            // plegadas: la lista no queda larguísima de entrada.
            setPlegadas([...admin.regiones, ...regionesDeSueltas]);
            setExcluidas(
              lista
                .filter((c) => regionesDeSueltas.includes(c.region) && !admin.comunas.includes(c.id))
                .map((c) => c.id),
            );
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
  const comunasDe = (region: string) => comunas.filter((c) => c.region === region);
  /** Cuántas comunas de una región encendida quedaron elegidas. */
  const elegidasDe = (region: string) => comunasDe(region).filter((c) => !excluidas.includes(c.id)).length;

  /**
   * Lo que se guarda: cada región encendida con TODAS sus comunas va como
   * región completa (así cubre también las comunas que se agreguen después);
   * si se apagó alguna, van solo sus comunas encendidas.
   */
  function zonaParaGuardar(): { regiones: string[]; comunas: string[] } {
    const regiones: string[] = [];
    const sueltas: string[] = [];
    for (const region of activas) {
      const todas = comunasDe(region);
      const encendidas = todas.filter((c) => !excluidas.includes(c.id));
      if (encendidas.length === todas.length) regiones.push(region);
      else sueltas.push(...encendidas.map((c) => c.id));
    }
    return { regiones, comunas: sueltas };
  }

  function alternarRegion(region: string) {
    if (activas.includes(region)) {
      setActivas((a) => a.filter((r) => r !== region));
    } else {
      // Al encenderla, todas sus comunas parten encendidas.
      const ids = comunasDe(region).map((c) => c.id);
      setExcluidas((e) => e.filter((id) => !ids.includes(id)));
      setActivas((a) => [...a, region]);
      setPlegadas((p) => p.filter((r) => r !== region));
    }
  }

  /** Lo elegido, en una línea: "Arica · Antofagasta (2 de 9)". */
  const resumenZona =
    activas.length === 0
      ? 'Ninguna'
      : [...activas]
          .sort(compararRegiones)
          .map((r) => {
            const total = comunasDe(r).length;
            const elegidas = elegidasDe(r);
            return elegidas === total ? sinPrefijo(r) : `${sinPrefijo(r)} (${elegidas} de ${total})`;
          })
          .join(' · ');

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
    const zona = zonaParaGuardar();
    if (zona.regiones.length === 0 && zona.comunas.length === 0) {
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

      await asignarAdminZona({ usuarioId, permisos, regiones: zona.regiones, comunas: zona.comunas });
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
      <EncabezadoMarca subtitulo={editando ? 'Editar administrador' : 'Nuevo administrador'} />

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
            <Text style={styles.bloqueTitulo}>Regiones y comunas</Text>
            <Text style={styles.bloqueValor}>{resumenZona}</Text>
          </Pressable>
          {verRegiones &&
            todasLasRegiones.map((region) => {
              const encendida = activas.includes(region);
              const abierta = encendida && !plegadas.includes(region);
              const delaRegion = comunasDe(region);
              return (
                <View key={region}>
                  <View style={styles.opcion}>
                    {/* Tocar el nombre pliega o despliega sus comunas, sin apagar la región. */}
                    <Pressable
                      style={styles.opcionTexto}
                      onPress={() => encendida && setPlegadas((p) => alternar(p, region))}
                      disabled={!encendida}
                      hitSlop={6}>
                      <Text style={styles.opcionLabel}>{sinPrefijo(region)}</Text>
                    </Pressable>
                    {encendida && <Text style={styles.contador}>{`${elegidasDe(region)}/${delaRegion.length}`}</Text>}
                    <Interruptor
                      value={encendida}
                      onValueChange={() => alternarRegion(region)}
                      accessibilityLabel={`Incluir la región ${sinPrefijo(region)}`}
                    />
                  </View>
                  {/* Sus comunas, solo si la región está encendida y desplegada. */}
                  {abierta &&
                    delaRegion.map((comuna) => (
                      <View key={comuna.id} style={[styles.opcion, styles.opcionComuna]}>
                        <Text style={[styles.opcionLabel, styles.opcionTexto]}>{`- ${comuna.nombre}`}</Text>
                        <Interruptor
                          value={!excluidas.includes(comuna.id)}
                          onValueChange={() => setExcluidas((e) => alternar(e, comuna.id))}
                          accessibilityLabel={`Incluir ${comuna.nombre} en su zona`}
                        />
                      </View>
                    ))}
                </View>
              );
            })}

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
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  // Las comunas, un poco más adentro que el nombre de su región.
  opcionComuna: {
    paddingLeft: Spacing.four,
  },
  contador: {
    fontFamily: Fonts.light,
    fontSize: 15,
    color: Colors.textMuted,
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

