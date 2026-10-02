import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/ui/Texto';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState } from '@/components/catalog/CatalogState';
import { Button } from '@/components/ui/Button';
import { ControlMedida } from '@/components/ui/ControlMedida';
import { Guias, VistaPreviaTitulo } from '@/components/ui/VistaPreviaTitulo';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { REJILLA, u } from '@/lib/rejilla';
import { getErrorMessage } from '@/lib/errors';
import { PickedImage, pickAndCompressImage, uploadCompressedImage } from '@/lib/images';
import {
  ANCHO_MIN,
  PERIMETRO_ALTO,
  LogoTematico,
  MEDIDAS_POR_DEFECTO,
  MedidasLogo,
  crearLogo,
  esErrorMigracionFaltante,
  estadoLogo,
  guardarMedidasLogo,
  limpiarLogosSobrantes,
  parseFecha,
  restablecerMedidasPorDefecto,
} from '@/lib/marca';
import { supabase } from '@/lib/supabase';
import { precargarTitulo, recordarMedidasTitulo, tituloEnMemoria } from '@/lib/cacheAdmin';

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

/** Aire entre el texto de debajo del título y el banner (rejilla de 1000): 0 = pueden quedar justo al borde, nunca encimados. */
const AIRE_BANNER = 0;
/** Distancia del logo al texto de debajo: la misma del inicio y los encabezados. */
const SEPARACION_TEXTO = 8;

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
  const insets = useSafeAreaInsets();
  // Lo que el panel ya dejó precargado: la pantalla aparece completa y con
  // las medidas reales al instante, sin ruedita. Por detrás se vuelve a pedir.
  const precargado = tituloEnMemoria();
  const [logos, setLogos] = useState<LogoTematico[]>(precargado?.logos ?? []);
  const [error, setError] = useState<string | null>(null);
  const [faltaMigracion, setFaltaMigracion] = useState(false);
  const [creando, setCreando] = useState(false);

  // `guardadas` es lo que hoy ven los usuarios y `medidas` lo que el admin
  // está probando: mientras difieran aparece el botón de guardar, porque el
  // cambio afecta a todo el mundo y no debe aplicarse por tocar un "+".
  const [medidas, setMedidas] = useState<MedidasLogo>(precargado?.medidas ?? MEDIDAS_POR_DEFECTO);
  const [guardadas, setGuardadas] = useState<MedidasLogo>(precargado?.medidas ?? MEDIDAS_POR_DEFECTO);
  /** Lo guardado, para compararlo dentro del refresco sin recrearlo. */
  const guardadasRef = useRef(guardadas);
  useEffect(() => {
    guardadasRef.current = guardadas;
  }, [guardadas]);
  const [guardando, setGuardando] = useState(false);
  const [guias, setGuias] = useState<Guias>({ centro: false, alto: false, ancho: false });
  // Forma de la imagen que se está mostrando (ancho ÷ alto). La avisa la
  // vista previa al cargarla, y de ella sale el "Alto" del título.
  const [, setProporcion] = useState(483 / 143);

  // Refresca por detrás. Si el administrador ya empezó a mover algo, sus
  // cambios sin guardar no se pisan: solo se actualiza lo guardado.
  const load = useCallback(async () => {
    setError(null);
    setFaltaMigracion(false);
    try {
      // Borra los logos que ya no corresponden (los "de siempre" reemplazados
      // y los con fecha vencidos) antes de leer la lista.
      await limpiarLogosSobrantes();
      const { logos: lista, medidas: actuales } = await precargarTitulo();
      setLogos(lista);
      const antes = guardadasRef.current;
      setMedidas((m) => (m.centroY === antes.centroY && m.alto === antes.alto && m.ancho === antes.ancho ? actuales : m));
      setGuardadas(actuales);
    } catch (err) {
      if (esErrorMigracionFaltante(err)) setFaltaMigracion(true);
      else setError(getErrorMessage(err, 'Error desconocido.'));
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
      recordarMedidasTitulo(medidas);
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

  // Márgenes del título, en la rejilla de 1000 y para ESTA pantalla: ni el
  // logo ni el texto de debajo (la comuna, "Chile", "Admin"...) pueden tocar
  // lo que los rodea — la barra de arriba, el banner o los bordes. Se mide
  // con el mismo tamaño de texto que usan el inicio y los encabezados.
  const { width: anchoPantalla } = useWindowDimensions();
  const unidad = anchoPantalla / 1000;
  const tamanoTexto = Math.min(26, Math.max(14, Math.round((anchoPantalla * 45) / 1000)));
  const altoTexto = Math.round(tamanoTexto * 1.3) / unidad;
  const arribaMin = Math.ceil(insets.top / unidad);
  const abajoMax = Math.floor(PERIMETRO_ALTO - AIRE_BANNER - SEPARACION_TEXTO - altoTexto);
  const margenCentro = {
    min: Math.ceil(arribaMin + medidas.alto / 2),
    max: Math.floor(abajoMax - medidas.alto / 2),
  };
  const margenAlto = {
    max: Math.floor(2 * Math.min(medidas.centroY - arribaMin, abajoMax - medidas.centroY)),
  };
  const margenAncho = { max: 1000 - 2 * REJILLA.margenLateral };

  const vigente = logoDeHoy(logos);
  const hayCambios = !mismasMedidas(medidas, guardadas);
  const enDefecto = mismasMedidas(guardadas, MEDIDAS_POR_DEFECTO);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Sin barra de "Volver" ni "+ Nuevo" (documento EDIT APP): arriba va
          directamente la maqueta del inicio, desde el borde de la pantalla,
          con el perímetro fijo de 340, la comuna y la silueta del banner. Para
          subir un logo nuevo se toca el título; para salir, el botón atrás
          del teléfono. La maqueta queda fija: lo que se desplaza son los
          controles, así el resultado siempre está a la vista. */}
      <VistaPreviaTitulo
        key={vigente?.id ?? 'normal'}
        medidas={medidas}
        alto={medidas.alto}
        url={vigente?.imagen_url ?? null}
        guias={guias}
        comuna="Valdivia"
        recorteArriba={insets.top}
        onCambiarImagen={faltaMigracion ? undefined : () => setCreando(true)}
        onProporcion={setProporcion}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

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
              margen={margenCentro}
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
              margen={margenAlto}
            />
            <ControlMedida
              etiqueta="Ancho"
              valor={medidas.ancho}
              onChange={(ancho) => setMedidas((m) => ({ ...m, ancho }))}
              guia={guias.ancho}
              onGuia={(ancho) => setGuias((g) => ({ ...g, ancho }))}
              min={ANCHO_MIN}
              margen={margenAncho}
            />
          </View>
        )}

        {/* Guardar, al final de los controles: baja con la pantalla en vez de
            flotar encima de ella. Gris mientras no haya nada nuevo que
            guardar, porque el cambio lo ven todos los usuarios. */}
        {!faltaMigracion && (
          <Pressable
            style={({ pressed }) => [
              styles.guardar,
              !hayCambios && styles.guardarApagado,
              pressed && hayCambios && styles.guardarPresionado,
            ]}
            onPress={handleGuardar}
            disabled={!hayCambios || guardando}
            accessibilityRole="button">
            <Text style={styles.guardarLabel}>{guardando ? 'Guardando…' : 'Guardar'}</Text>
          </Pressable>
        )}

        {/* Justo debajo de "Guardar": es la salida
            de emergencia después de probar medidas, no algo que se toque
            todos los días. Apagado cuando ya está en el original. */}
        {!faltaMigracion && (
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
        )}

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
            <Text style={styles.fechasHint}>Sin fechas, reemplaza al logo actual. Con fechas, se muestra solo esos días y después vuelve el actual.</Text>

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
  content: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
  },
  medidas: {
    marginTop: Spacing.two,
  },
  guardar: {
    marginHorizontal: u(REJILLA.margenLateral) - Spacing.three,
    marginTop: Spacing.five,
    paddingVertical: Spacing.four,
    borderRadius: u(REJILLA.curvatura),
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  guardarApagado: {
    backgroundColor: '#7F7F7F',
  },
  guardarPresionado: {
    backgroundColor: Colors.accentPressed,
  },
  guardarLabel: {
    fontFamily: Fonts.medium,
    fontSize: 21,
    color: '#FFFFFF',
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
