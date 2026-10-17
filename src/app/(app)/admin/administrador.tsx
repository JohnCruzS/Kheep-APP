import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/ui/Texto';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoadingState } from '@/components/catalog/CatalogState';
import { Button } from '@/components/ui/Button';
import { CampoClave } from '@/components/ui/CampoClave';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { FormScroll } from '@/components/ui/FormScroll';
import { Interruptor } from '@/components/ui/Interruptor';
import { Colors, Fonts, Spacing, TarjetaLista } from '@/constants/theme';
import {
  GRUPOS_PERMISOS,
  alternarGrupo,
  grupoActivo,
  PermisoZona,
  asignarAdminZona,
  crearCuentaAdministrador,
  listarAdminsZona,
} from '@/lib/administradores';
import { ComunaAdmin, fetchComunasAdmin } from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { REJILLA, u } from '@/lib/rejilla';
import { isValidEmail } from '@/lib/validation';
import { compararRegiones, nombreRegion } from '@/lib/regiones';

const sinPrefijo = nombreRegion;

/**
 * Crear un administrador de zona, o cambiarle la zona (maqueta del cliente).
 *
 *  - Nuevo: nombre, correo y contraseña en líneas; el botón blanco
 *    "Ubicación" abre las regiones; los tres permisos; y "Guardar" fijo abajo.
 *    Si el correo ya tiene cuenta, se asciende esa en vez de crear otra.
 *  - Editar (se llega tocando "zona – …" en Admin): directamente la vista
 *    "Ubicación", con "Guardar" abajo. Los permisos se cambian en Admin.
 *
 * Ubicación: una tarjeta por región con su interruptor; encendida, adentro
 * aparecen sus comunas, cada una con el suyo. Tocar el nombre de la región
 * pliega o despliega sus comunas.
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
  /** Regiones encendidas con su lista de comunas plegada (se toca el nombre para abrir o cerrar). */
  const [plegadas, setPlegadas] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  /** Al crear, la vista "Ubicación" se abre aparte con el botón blanco. */
  const [eligiendoUbicacion, setEligiendoUbicacion] = useState(false);
  /**
   * Dos toques sobre el título alternan entre "Chile" (todas las regiones y
   * comunas) y "Visible" (solo las que hoy se ven en la app): la zona se
   * puede elegir del total o solo entre las visibles (pedido del cliente).
   */
  const [soloVisibles, setSoloVisibles] = useState(false);
  const subtituloUbicacion = soloVisibles ? 'Visible' : 'Chile';
  const alternarVisibles = () => setSoloVisibles((v) => !v);

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
      // Al encenderla, todas sus comunas parten encendidas; en "Visible",
      // solo las visibles: las ocultas (que no se ven en pantalla) quedan fuera.
      const ids = comunasDe(region).map((c) => c.id);
      const ocultas = soloVisibles ? comunasDe(region).filter((c) => !c.activa).map((c) => c.id) : [];
      setExcluidas((e) => [...e.filter((id) => !ids.includes(id)), ...ocultas]);
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

  /** Lo que se muestra de una región: todas sus comunas, o solo las visibles en la app. */
  const mostradasDe = (region: string) => comunasDe(region).filter((c) => !soloVisibles || c.activa);

  /** Las regiones como tarjetas, con sus comunas adentro (vista "Ubicación"). */
  function regiones() {
    // En "Visible", las regiones sin ninguna comuna visible no aparecen.
    return todasLasRegiones.filter((region) => mostradasDe(region).length > 0).map((region) => {
      const encendida = activas.includes(region);
      const abierta = encendida && !plegadas.includes(region);
      return (
        <View key={region} style={styles.tarjetaRegion}>
          <View style={styles.cabeceraRegion}>
            {/* Tocar el nombre pliega o despliega sus comunas, sin apagar la región. */}
            <Pressable
              style={styles.zonaNombre}
              onPress={() => encendida && setPlegadas((p) => alternar(p, region))}
              disabled={!encendida}
              hitSlop={6}>
              <Text style={styles.region} numberOfLines={1}>
                {sinPrefijo(region)}
              </Text>
            </Pressable>
            <Interruptor
              value={encendida}
              onValueChange={() => alternarRegion(region)}
              accessibilityLabel={`Incluir la región ${sinPrefijo(region)}`}
            />
          </View>
          {abierta && (
            <View style={styles.comunas}>
              {mostradasDe(region).map((comuna) => (
                <View key={comuna.id} style={styles.filaComuna}>
                  <Text style={styles.comuna} numberOfLines={1}>
                    {comuna.nombre}
                  </Text>
                  <Interruptor
                    value={!excluidas.includes(comuna.id)}
                    onValueChange={() => setExcluidas((e) => alternar(e, comuna.id))}
                    accessibilityLabel={`Incluir ${comuna.nombre} en su zona`}
                  />
                </View>
              ))}
            </View>
          )}
        </View>
      );
    });
  }

  /** "Guardar", fijo abajo de la pantalla (no se desplaza con lo demás). */
  function botonGuardar(onPress: () => void, texto = 'Guardar') {
    return (
      <View style={styles.abajo}>
        {error && <Text style={styles.error}>{error}</Text>}
        <Button label={guardando ? 'Guardando…' : texto} onPress={onPress} loading={guardando} />
      </View>
    );
  }

  // Editar: la zona y nada más.
  if (editando) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <EncabezadoMarca subtitulo={subtituloUbicacion} onDobleToque={alternarVisibles} />
        {loading ? (
          <LoadingState />
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.contenidoUbicacion} showsVerticalScrollIndicator={false}>
              {regiones()}
            </ScrollView>
            {botonGuardar(handleGuardar)}
          </>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <EncabezadoMarca subtitulo="Nuevo" />

      {loading ? (
        <LoadingState />
      ) : (
        <>
          <FormScroll contentContainerStyle={styles.content}>
            <TextInput
              placeholder="Nombre"
              placeholderTextColor={Colors.text}
              value={nombre}
              onChangeText={setNombre}
              autoCapitalize="words"
              style={styles.campo}
            />
            <TextInput
              placeholder="Correo"
              placeholderTextColor={Colors.text}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.campo}
            />
            <CampoClave
              placeholder="Contraseña"
              placeholderTextColor={Colors.text}
              value={password}
              onChangeText={setPassword}
              style={[styles.campo, styles.campoClave]}
            />

            {/* El botón blanco abre las regiones; debajo, lo elegido. */}
            <Pressable
              style={({ pressed }) => [styles.botonUbicacion, pressed && styles.botonUbicacionPresionado]}
              onPress={() => setEligiendoUbicacion(true)}
              accessibilityRole="button">
              <Text style={styles.botonUbicacionTexto}>Ubicación</Text>
            </Pressable>
            {activas.length > 0 && <Text style={styles.resumen}>{resumenZona}</Text>}

            {/* Las tres atribuciones de un administrador de zona. */}
            <View style={styles.permisos}>
              {GRUPOS_PERMISOS.map((grupo) => (
                <View key={grupo.id} style={styles.filaPermiso}>
                  <Text style={styles.permiso}>{grupo.nombre}</Text>
                  <Interruptor
                    value={grupoActivo(permisos, grupo)}
                    onValueChange={() => setPermisos((p) => alternarGrupo(p, grupo))}
                    accessibilityLabel={grupo.nombre}
                  />
                </View>
              ))}
            </View>
          </FormScroll>
          {botonGuardar(handleGuardar)}
        </>
      )}

      {/* "Ubicación", a pantalla completa; su "Guardar" vuelve al formulario. */}
      <Modal visible={eligiendoUbicacion} animationType="none" onRequestClose={() => setEligiendoUbicacion(false)}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <EncabezadoMarca subtitulo={subtituloUbicacion} onDobleToque={alternarVisibles} />
          <ScrollView contentContainerStyle={styles.contenidoUbicacion} showsVerticalScrollIndicator={false}>
            {regiones()}
          </ScrollView>
          <View style={styles.abajo}>
            <Button label="Guardar" onPress={() => setEligiendoUbicacion(false)} />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: u(REJILLA.margenLateral) + Spacing.four,
    paddingBottom: Spacing.five,
  },
  // Nombre, correo y contraseña: líneas, como la maqueta.
  campo: {
    fontFamily: Fonts.delgada,
    fontSize: 20,
    color: Colors.text,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    paddingVertical: Spacing.three,
    marginTop: Spacing.three,
  },
  // La contraseña alineada a la izquierda como las otras líneas (el ojo, a la derecha).
  campoClave: {
    paddingLeft: 0,
  },
  // El botón blanco "Ubicación".
  botonUbicacion: {
    marginTop: Spacing.five,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  botonUbicacionPresionado: {
    opacity: 0.85,
  },
  botonUbicacionTexto: {
    fontFamily: Fonts.medium,
    fontSize: 21,
    color: '#000000',
  },
  resumen: {
    fontFamily: Fonts.delgada,
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  permisos: {
    marginTop: Spacing.five,
    gap: Spacing.four,
  },
  filaPermiso: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  permiso: {
    fontFamily: Fonts.delgada,
    fontSize: 21,
    color: Colors.text,
  },
  // Vista "Ubicación": tarjetas de región.
  contenidoUbicacion: {
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingBottom: Spacing.four,
  },
  tarjetaRegion: {
    backgroundColor: TarjetaLista.fondo,
    borderRadius: u(REJILLA.curvatura),
    borderWidth: 1,
    borderColor: TarjetaLista.borde,
    marginBottom: u(REJILLA.margenLateral),
    paddingHorizontal: TarjetaLista.sangria,
  },
  cabeceraRegion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: u(240) - 2,
  },
  zonaNombre: {
    flex: 1,
  },
  region: {
    fontFamily: Fonts.tarjeta,
    fontSize: TarjetaLista.tamanoTexto,
    color: Colors.text,
  },
  comunas: {
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  filaComuna: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: Spacing.four,
  },
  comuna: {
    flex: 1,
    fontFamily: Fonts.delgada,
    fontSize: 21,
    color: Colors.text,
  },
  // "Guardar" fijo abajo.
  abajo: {
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingBottom: Spacing.three,
  },
  error: {
    fontFamily: Fonts.delgada,
    fontSize: 14,
    color: Colors.danger,
    textAlign: 'center',
    marginBottom: Spacing.one,
  },
});
