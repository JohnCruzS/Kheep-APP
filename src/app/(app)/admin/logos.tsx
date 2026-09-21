import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { Button } from '@/components/ui/Button';
import { ControlMedida } from '@/components/ui/ControlMedida';
import { Guias, VistaPreviaTitulo } from '@/components/ui/VistaPreviaTitulo';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { getErrorMessage } from '@/lib/errors';
import { PickedImage, pickAndCompressImage, uploadCompressedImage } from '@/lib/images';
import {
  ANCHO_MIN,
  PERIMETRO_ALTO,
  EstadoLogo,
  LogoTematico,
  MEDIDAS_POR_DEFECTO,
  MedidasLogo,
  actualizarLogoActivo,
  crearLogo,
  eliminarLogo,
  esErrorMigracionFaltante,
  estadoLogo,
  fetchLogosAdmin,
  fetchMedidasLogo,
  formatearFecha,
  guardarMedidasLogo,
  parseFecha,
  restablecerMedidasPorDefecto,
} from '@/lib/marca';
import { supabase } from '@/lib/supabase';

const ETIQUETA_ESTADO: Record<EstadoLogo, string> = {
  vigente: 'Vigente hoy',
  programado: 'Programado',
  vencido: 'Vencido',
  inactivo: 'Desactivado',
};

function rangoFechas(logo: LogoTematico): string {
  const { fecha_inicio: ini, fecha_fin: fin } = logo;
  if (ini && fin) return `Del ${formatearFecha(ini)} al ${formatearFecha(fin)}`;
  if (ini) return `Desde el ${formatearFecha(ini)}`;
  if (fin) return `Hasta el ${formatearFecha(fin)}`;
  return 'Siempre (sin fechas)';
}

/**
 * El logo que la app está mostrando hoy, con el mismo criterio de desempate
 * que usa `src/lib/marca.ts`: entre los vigentes gana el de fecha de inicio
 * más reciente, y los sin fecha quedan al final.
 */
function logoDeHoy(logos: LogoTematico[]): LogoTematico | null {
  const vigentes = logos.filter((l) => estadoLogo(l) === 'vigente');
  if (vigentes.length === 0) return null;
  return [...vigentes].sort((a, b) => (b.fecha_inicio ?? '').localeCompare(a.fecha_inicio ?? ''))[0];
}

const mismasMedidas = (a: MedidasLogo, b: MedidasLogo) =>
  a.centroX === b.centroX && a.ancho === b.ancho && a.centroY === b.centroY;

/**
 * Título de la app: qué imagen es, dónde va y de qué tamaño.
 *
 * El título se coloca dentro de un perímetro —tan ancho como el banner y tan
 * alto como el espacio que va de arriba de la pantalla al banner— con tres
 * medidas en la rejilla de 1000 del cliente:
 *
 *   Centro  distancia desde el borde de arriba de la pantalla al centro
 *           exacto de la imagen
 *   Alto    lo que mide la imagen de arriba a abajo
 *   Ancho   lo que mide de lado a lado
 *
 * El título va siempre centrado a lo ancho de la pantalla, como en el
 * documento EDIT APP. Alto y Ancho son la misma medida vista de dos formas:
 * mover una mueve la otra, y así la imagen nunca se deforma.
 *
 * Arriba se ve una maqueta de la pantalla con esas medidas aplicadas: los
 * tres números solo se entienden mirando el resultado, no leyéndolos. Cada
 * medida tiene además un interruptor que enciende su guía en la maqueta.
 */
export default function LogosAdminScreen() {
  const router = useRouter();
  const [logos, setLogos] = useState<LogoTematico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [faltaMigracion, setFaltaMigracion] = useState(false);
  const [creando, setCreando] = useState(false);

  // `guardadas` es lo que hoy ven los usuarios y `medidas` lo que el admin
  // está probando: mientras difieran aparece el botón de guardar, porque el
  // cambio afecta a todo el mundo y no debe aplicarse por tocar un "+".
  const [medidas, setMedidas] = useState<MedidasLogo>(MEDIDAS_POR_DEFECTO);
  const [guardadas, setGuardadas] = useState<MedidasLogo>(MEDIDAS_POR_DEFECTO);
  const [guardando, setGuardando] = useState(false);
  const [guias, setGuias] = useState<Guias>({ centro: false, alto: false, ancho: false });
  // Forma de la imagen que se está mostrando (ancho ÷ alto). La avisa la
  // vista previa al cargarla, y de ella sale el "Alto" del título.
  const [, setProporcion] = useState(483 / 143);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFaltaMigracion(false);
    try {
      const [lista, actuales] = await Promise.all([fetchLogosAdmin(), fetchMedidasLogo()]);
      setLogos(lista);
      setMedidas(actuales);
      setGuardadas(actuales);
    } catch (err) {
      if (esErrorMigracionFaltante(err)) setFaltaMigracion(true);
      else setError(getErrorMessage(err, 'Error desconocido.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleGuardar() {
    setGuardando(true);
    setError(null);
    try {
      await guardarMedidasLogo(medidas);
      setGuardadas(medidas);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudieron guardar las medidas.'));
    } finally {
      setGuardando(false);
    }
  }

  function handleRestablecer() {
    Alert.alert(
      'Volver a las medidas originales',
      'El título vuelve a la posición y el tamaño del diseño. El cambio lo ven todos los usuarios; los logos por fecha no se tocan.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restablecer',
          onPress: async () => {
            setGuardando(true);
            setError(null);
            try {
              await restablecerMedidasPorDefecto();
              setMedidas(MEDIDAS_POR_DEFECTO);
              setGuardadas(MEDIDAS_POR_DEFECTO);
            } catch (err) {
              setError(getErrorMessage(err, 'No se pudieron restablecer las medidas.'));
            } finally {
              setGuardando(false);
            }
          },
        },
      ],
    );
  }

  async function handleToggle(logo: LogoTematico) {
    const nuevo = !logo.activo;
    setLogos((list) => list.map((l) => (l.id === logo.id ? { ...l, activo: nuevo } : l)));
    try {
      await actualizarLogoActivo(logo.id, nuevo);
    } catch (err) {
      setLogos((list) => list.map((l) => (l.id === logo.id ? { ...l, activo: logo.activo } : l)));
      setError(getErrorMessage(err, 'No se pudo actualizar el logo.'));
    }
  }

  function handleEliminar(logo: LogoTematico) {
    Alert.alert('Eliminar logo', `¿Eliminar "${logo.nombre}"? Si estaba vigente, la app vuelve al logo normal.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await eliminarLogo(logo.id);
            load();
          } catch (err) {
            setError(getErrorMessage(err, 'No se pudo eliminar el logo.'));
          }
        },
      },
    ]);
  }

  const vigente = logoDeHoy(logos);
  const hayCambios = !mismasMedidas(medidas, guardadas);
  const enDefecto = mismasMedidas(guardadas, MEDIDAS_POR_DEFECTO);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backLabel}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.topTitle}>Título de la app</Text>
        {faltaMigracion ? (
          <View style={{ width: 70 }} />
        ) : (
          <Pressable onPress={() => setCreando(true)} hitSlop={12}>
            <Text style={styles.addLabel}>+ Nuevo</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.previewBox}>
          <VistaPreviaTitulo
            key={vigente?.id ?? 'normal'}
            medidas={medidas}
            alto={medidas.alto}
            url={vigente?.imagen_url ?? null}
            guias={guias}
            comuna="Valdivia"
            onCambiarImagen={faltaMigracion ? undefined : () => setCreando(true)}
            onProporcion={setProporcion}
          />
        </View>

        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={load} />}

        {faltaMigracion && (
          <View style={styles.aviso}>
            <Text style={styles.avisoTitulo}>Falta un paso en la base de datos</Text>
            <Text style={styles.avisoTexto}>
              Para colocar el título y programar logos por fecha hay que ejecutar en el editor SQL de Supabase las
              migraciones 0015_logos_tematicos.sql y 0020_logo_por_coordenadas.sql. Mientras tanto, la app muestra el
              logo normal en su posición de siempre.
            </Text>
          </View>
        )}

        {!faltaMigracion && (
          <View style={styles.medidas}>
            {/* El orden es el del documento: Centro, Alto, Ancho. El centro
                no puede pasar del perímetro (340): más abajo, el título se
                metería en el banner. */}
            <ControlMedida
              etiqueta="Centro"
              valor={medidas.centroY}
              onChange={(centroY) => setMedidas((m) => ({ ...m, centroY }))}
              guia={guias.centro}
              onGuia={(centro) => setGuias((g) => ({ ...g, centro }))}
              max={PERIMETRO_ALTO}
            />
            {/* Alto y Ancho son independientes: cada uno estira la imagen
                por su lado (documento EDIT APP). */}
            <ControlMedida
              etiqueta="Alto"
              valor={medidas.alto}
              onChange={(alto) => setMedidas((m) => ({ ...m, alto }))}
              guia={guias.alto}
              onGuia={(altoGuia) => setGuias((g) => ({ ...g, alto: altoGuia }))}
              min={10}
              max={PERIMETRO_ALTO}
            />
            <ControlMedida
              etiqueta="Ancho"
              valor={medidas.ancho}
              onChange={(ancho) => setMedidas((m) => ({ ...m, ancho }))}
              guia={guias.ancho}
              onGuia={(ancho) => setGuias((g) => ({ ...g, ancho }))}
              min={ANCHO_MIN}
            />

            <View style={styles.acciones}>
              {hayCambios ? (
                <>
                  <Button
                    label={guardando ? 'Guardando…' : 'Guardar'}
                    onPress={handleGuardar}
                    loading={guardando}
                  />
                  <Pressable onPress={() => setMedidas(guardadas)} hitSlop={8}>
                    <Text style={styles.deshacer}>Deshacer</Text>
                  </Pressable>
                </>
              ) : (
                <Text style={styles.estadoMedidas}>Así lo ven todos los usuarios.</Text>
              )}
            </View>

            {/* Siempre visible: es la salida de emergencia después de probar
                medidas, y tener que adivinar si aparece o no la hace inútil.
                Cuando ya está en el original queda apagado, para que se vea
                que no hay nada que deshacer. */}
            <Pressable
              style={({ pressed }) => [
                styles.restablecerFila,
                pressed && styles.restablecerPresionada,
                enDefecto && styles.restablecerApagada,
              ]}
              onPress={handleRestablecer}
              disabled={guardando || enDefecto}>
              <Ionicons name="refresh-outline" size={17} color={enDefecto ? Colors.textMuted : Colors.text} />
              <Text style={[styles.restablecerLabel, enDefecto && styles.restablecerLabelApagado]}>
                {enDefecto ? 'Está en las medidas originales' : 'Volver a las medidas originales'}
              </Text>
            </Pressable>
          </View>
        )}

        {logos.map((logo) => {
          const estado = estadoLogo(logo);
          return (
            <View key={logo.id} style={styles.row}>
              <View style={styles.thumb}>
                <Image source={{ uri: logo.imagen_url }} style={styles.thumbImg} contentFit="contain" />
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.nombre} numberOfLines={1}>
                  {logo.nombre}
                </Text>
                <Text style={styles.fechas}>{rangoFechas(logo)}</Text>
                <Text style={[styles.estado, estado === 'vigente' && styles.estadoVigente]}>
                  {ETIQUETA_ESTADO[estado]}
                </Text>
              </View>
              <View style={styles.rowActions}>
                <Switch
                  value={logo.activo}
                  onValueChange={() => handleToggle(logo)}
                  trackColor={{ false: Colors.surfaceBorder, true: Colors.accent }}
                  thumbColor="#FFFFFF"
                />
                <Pressable onPress={() => handleEliminar(logo)} hitSlop={8}>
                  <Text style={styles.eliminar}>Eliminar</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <NuevoLogoModal visible={creando} onClose={() => setCreando(false)} onSaved={load} />
    </SafeAreaView>
  );
}

/** Subir un logo nuevo y ponerle fechas. El tamaño y la posición son los del título, comunes a todos. */
function NuevoLogoModal({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const [imagen, setImagen] = useState<PickedImage | null>(null);
  const [nombre, setNombre] = useState('');
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setImagen(null);
      setNombre('');
      setInicio('');
      setFin('');
      setError(null);
    }
  }, [visible]);

  async function handleElegir() {
    try {
      // PNG y sin recorte: un logo necesita su fondo transparente y su forma original.
      const img = await pickAndCompressImage({ recortar: false, formato: 'png', uso: 'titulo' });
      if (img) setImagen(img);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo abrir la galería.'));
    }
  }

  async function handleGuardar() {
    if (!imagen) return setError('Elige la imagen del logo.');
    if (nombre.trim().length === 0) return setError('Ponle un nombre (ej: Fiestas Patrias).');
    const fi = inicio.trim() ? parseFecha(inicio) : null;
    if (inicio.trim() && !fi) return setError('La fecha "desde" no es válida. Usa DD/MM/AAAA.');
    const ff = fin.trim() ? parseFecha(fin) : null;
    if (fin.trim() && !ff) return setError('La fecha "hasta" no es válida. Usa DD/MM/AAAA.');
    if (fi && ff && ff < fi) return setError('La fecha "hasta" no puede ser anterior a la fecha "desde".');

    setSaving(true);
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const url = await uploadCompressedImage('banners', auth.user!.id, imagen, 'logo-tematico');
      await crearLogo({ nombre: nombre.trim(), imagenUrl: url, fechaInicio: fi, fechaFin: ff });
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo guardar el logo.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Sube el panel por sobre el teclado: si no, los campos de abajo
            quedan tapados y no se ve lo que se escribe. */}
        <KeyboardAvoidingView behavior="padding">
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Nuevo logo</Text>

            <Pressable onPress={handleElegir} style={styles.imagenBox}>
              {imagen ? (
                <Image source={{ uri: imagen.uri }} style={styles.imagenPreview} contentFit="contain" />
              ) : (
                <Text style={styles.imagenHint}>
                  {'Toca para elegir la imagen\n(ideal: PNG con fondo transparente)'}
                </Text>
              )}
            </Pressable>

            <TextInput
              placeholder="Nombre (ej: Fiestas Patrias)"
              placeholderTextColor={Colors.placeholder}
              value={nombre}
              onChangeText={setNombre}
              style={styles.input}
            />
            <View style={styles.fechasRow}>
              <TextInput
                placeholder="Desde DD/MM/AAAA"
                placeholderTextColor={Colors.placeholder}
                value={inicio}
                onChangeText={setInicio}
                keyboardType="numbers-and-punctuation"
                style={[styles.input, styles.inputFecha]}
              />
              <TextInput
                placeholder="Hasta DD/MM/AAAA"
                placeholderTextColor={Colors.placeholder}
                value={fin}
                onChangeText={setFin}
                keyboardType="numbers-and-punctuation"
                style={[styles.input, styles.inputFecha]}
              />
            </View>
            <Text style={styles.fechasHint}>Deja las fechas vacías para que quede siempre.</Text>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Button label={saving ? 'Guardando…' : 'Guardar'} onPress={handleGuardar} loading={saving} />
            <Pressable onPress={onClose} style={styles.cancelRow}>
              <Text style={styles.cancelLabel}>Cancelar</Text>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
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
    width: 70,
  },
  topTitle: {
    fontFamily: Fonts.semiBold,
    color: Colors.text,
    fontSize: 15,
  },
  addLabel: {
    fontFamily: Fonts.semiBold,
    color: Colors.accent,
    fontSize: 14,
    width: 70,
    textAlign: 'right',
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
  },
  previewBox: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  previewNota: {
    fontFamily: Fonts.light,
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  medidas: {
    marginTop: Spacing.two,
  },
  acciones: {
    marginTop: Spacing.five,
    gap: Spacing.two,
    alignItems: 'center',
  },
  estadoMedidas: {
    fontFamily: Fonts.light,
    fontSize: 12.5,
    color: Colors.textMuted,
  },
  deshacer: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: Colors.textMuted,
  },
  restablecerFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  restablecerPresionada: {
    backgroundColor: Colors.backgroundAlt,
  },
  restablecerApagada: {
    opacity: 0.5,
  },
  restablecerLabelApagado: {
    color: Colors.textMuted,
  },
  restablecerLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.text,
  },
  ayuda: {
    fontFamily: Fonts.light,
    marginTop: Spacing.six,
    marginBottom: Spacing.three,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textMuted,
  },
  aviso: {
    backgroundColor: Colors.warningBg,
    borderRadius: 12,
    padding: Spacing.three,
  },
  avisoTitulo: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: Colors.warning,
    marginBottom: 4,
  },
  avisoTexto: {
    fontFamily: Fonts.light,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.text,
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
  thumb: {
    width: 84,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImg: {
    width: '90%',
    height: '80%',
  },
  rowInfo: {
    flex: 1,
  },
  nombre: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.text,
  },
  fechas: {
    fontFamily: Fonts.light,
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  estado: {
    fontFamily: Fonts.medium,
    fontSize: 11.5,
    color: Colors.textMuted,
    marginTop: 4,
  },
  estadoVigente: {
    color: Colors.success,
  },
  rowActions: {
    alignItems: 'center',
    gap: 6,
  },
  eliminar: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: Colors.danger,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.backgroundAlt,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    padding: Spacing.four,
    paddingBottom: Spacing.six,
  },
  sheetTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 17,
    color: Colors.text,
    marginBottom: Spacing.three,
  },
  imagenBox: {
    height: 110,
    borderRadius: 12,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  imagenPreview: {
    width: '85%',
    height: '75%',
  },
  imagenHint: {
    fontFamily: Fonts.light,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  input: {
    fontFamily: Fonts.light,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    paddingVertical: Spacing.two,
    fontSize: 16,
    color: Colors.text,
    marginBottom: Spacing.three,
  },
  fechasRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  inputFecha: {
    flex: 1,
    fontSize: 14,
  },
  fechasHint: {
    fontFamily: Fonts.light,
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: Spacing.three,
  },
  errorText: {
    fontFamily: Fonts.light,
    marginBottom: Spacing.three,
    fontSize: 13,
    color: Colors.danger,
  },
  cancelRow: {
    alignItems: 'center',
    paddingTop: Spacing.three,
  },
  cancelLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.textMuted,
  },
});
