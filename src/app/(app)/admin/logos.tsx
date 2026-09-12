import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { BrandLogoPreview } from '@/components/ui/BrandLogo';
import { Button } from '@/components/ui/Button';
import { ControlTamano } from '@/components/ui/ControlTamano';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { getErrorMessage } from '@/lib/errors';
import { PickedImage, pickAndCompressImage, uploadCompressedImage } from '@/lib/images';
import {
  ANCHO_LOGO_DEFECTO,
  EstadoLogo,
  LogoTematico,
  actualizarAnchoLogo,
  actualizarLogoActivo,
  crearLogo,
  eliminarLogo,
  esErrorMigracionFaltante,
  estadoLogo,
  fetchAnchoGeneral,
  fetchLogosAdmin,
  formatearFecha,
  guardarAnchoGeneral,
  parseFecha,
} from '@/lib/marca';
import { supabase } from '@/lib/supabase';

const ETIQUETA_ESTADO: Record<EstadoLogo, string> = {
  vigente: 'Vigente hoy',
  programado: 'Programado',
  vencido: 'Vencido',
  inactivo: 'Desactivado',
};

/**
 * El logo que la app está mostrando hoy, con el mismo criterio de desempate
 * que usa `src/lib/marca.ts`: entre los vigentes gana el de fecha de inicio
 * más reciente, y los sin fecha quedan al final. Si no hay ninguno, la app
 * está mostrando el logo normal.
 */
function logoDeHoy(logos: LogoTematico[]): LogoTematico | null {
  const vigentes = logos.filter((l) => estadoLogo(l) === 'vigente');
  if (vigentes.length === 0) return null;
  return [...vigentes].sort((a, b) => (b.fecha_inicio ?? '').localeCompare(a.fecha_inicio ?? ''))[0];
}

function rangoFechas(logo: LogoTematico): string {
  const { fecha_inicio: ini, fecha_fin: fin } = logo;
  if (ini && fin) return `Del ${formatearFecha(ini)} al ${formatearFecha(fin)}`;
  if (ini) return `Desde el ${formatearFecha(ini)}`;
  if (fin) return `Hasta el ${formatearFecha(fin)}`;
  return 'Siempre (sin fechas)';
}

/**
 * Logos temáticos "estilo Google Doodle": el admin sube una imagen y le pone
 * fechas; mientras esté vigente reemplaza al logo normal en toda la app, y
 * al terminar vuelve solo al normal. Ver migración 0015 y src/lib/marca.ts.
 */
export default function LogosAdminScreen() {
  const router = useRouter();
  const [logos, setLogos] = useState<LogoTematico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [faltaMigracion, setFaltaMigracion] = useState(false);
  const [creando, setCreando] = useState(false);
  // Tamaño general del título. `guardado` es lo que hoy ven los usuarios y
  // `ancho` lo que el admin está probando: mientras difieran se muestra el
  // botón de guardar, porque el cambio afecta a todo el mundo y no debe
  // aplicarse solo por tocar un botón de más o menos.
  const [ancho, setAncho] = useState(ANCHO_LOGO_DEFECTO);
  const [anchoGuardado, setAnchoGuardado] = useState(ANCHO_LOGO_DEFECTO);
  const [guardandoAncho, setGuardandoAncho] = useState(false);
  const [ajustando, setAjustando] = useState<LogoTematico | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFaltaMigracion(false);
    try {
      const [lista, anchoActual] = await Promise.all([fetchLogosAdmin(), fetchAnchoGeneral()]);
      setLogos(lista);
      setAncho(anchoActual);
      setAnchoGuardado(anchoActual);
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

  async function handleGuardarAncho() {
    setGuardandoAncho(true);
    setError(null);
    try {
      await guardarAnchoGeneral(ancho);
      setAnchoGuardado(ancho);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo guardar el tamaño.'));
    } finally {
      setGuardandoAncho(false);
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

  // Lo que se ve hoy: el logo temático vigente si lo hay, con su tamaño
  // propio; si no, el logo normal con el tamaño general que se está
  // ajustando, para ver el cambio en el momento.
  const vigente = logoDeHoy(logos);
  const anchoVistaPrevia = vigente?.ancho_pct ?? ancho;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backLabel}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.topTitle}>Logo de la app</Text>
        {faltaMigracion ? (
          <View style={{ width: 70 }} />
        ) : (
          <Pressable onPress={() => setCreando(true)} hitSlop={12}>
            <Text style={styles.addLabel}>+ Nuevo</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* La vista previa usa el tamaño que se está probando, y el recuadro
            tiene el ancho real de la pantalla: así se ve tal cual va a quedar
            el título en el catálogo, sin tener que salir a comprobarlo. */}
        <View style={styles.previewBox}>
          <Text style={styles.previewLabel}>ASÍ SE VE HOY</Text>
          <BrandLogoPreview
            key={vigente?.id ?? 'normal'}
            url={vigente?.imagen_url ?? null}
            anchoPct={anchoVistaPrevia}
          />
          {vigente && vigente.ancho_pct !== null ? (
            <Text style={styles.previewNota}>
              “{vigente.nombre}” está vigente con su tamaño propio ({vigente.ancho_pct} %).
            </Text>
          ) : null}
        </View>

        {!faltaMigracion && (
          <View style={styles.tamanoBox}>
            <Text style={styles.tamanoTitulo}>Tamaño del título</Text>
            <Text style={styles.tamanoAyuda}>
              Se mide como porcentaje del ancho de la pantalla, así se ve igual de grande en cualquier teléfono. Al
              guardar, el cambio lo ven todos los usuarios.
            </Text>
            <ControlTamano valor={ancho} onChange={setAncho} />
            {ancho !== anchoGuardado ? (
              <View style={styles.tamanoAcciones}>
                <Button
                  label={guardandoAncho ? 'Guardando…' : 'Guardar tamaño'}
                  onPress={handleGuardarAncho}
                  loading={guardandoAncho}
                />
                <Pressable onPress={() => setAncho(anchoGuardado)} hitSlop={8}>
                  <Text style={styles.deshacer}>Deshacer</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.tamanoEstado}>Este es el tamaño que ven todos.</Text>
            )}
          </View>
        )}

        <Text style={styles.ayuda}>
          Programa un logo para una fecha especial (Fiestas Patrias, Navidad, un aniversario…). Mientras esté vigente
          reemplaza al logo normal de Kheep en toda la app; al terminar su fecha, vuelve solo al normal. Cada logo puede
          además llevar su propio tamaño, porque no todas las imágenes tienen la misma forma.
        </Text>

        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={load} />}

        {faltaMigracion && (
          <View style={styles.aviso}>
            <Text style={styles.avisoTitulo}>Falta un paso en la base de datos</Text>
            <Text style={styles.avisoTexto}>
              Para programar logos y ajustar el tamaño del título hay que ejecutar las migraciones
              0015_logos_tematicos.sql y 0016_tamano_logo.sql en el editor SQL de Supabase. Mientras tanto, la app
              sigue mostrando el logo normal en su tamaño de siempre.
            </Text>
          </View>
        )}

        {!loading && !error && !faltaMigracion && logos.length === 0 && (
          <Text style={styles.vacio}>Todavía no hay logos programados. Crea el primero con “+ Nuevo”.</Text>
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
                <Pressable onPress={() => setAjustando(logo)} hitSlop={8}>
                  <Text style={styles.tamanoLink}>
                    Tamaño: {logo.ancho_pct === null ? `${anchoGuardado} % (general)` : `${logo.ancho_pct} %`}
                  </Text>
                </Pressable>
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

      <NuevoLogoModal visible={creando} onClose={() => setCreando(false)} onSaved={load} anchoGeneral={anchoGuardado} />
      <TamanoLogoModal logo={ajustando} anchoGeneral={anchoGuardado} onClose={() => setAjustando(null)} onSaved={load} />
    </SafeAreaView>
  );
}

function NuevoLogoModal({
  visible,
  onClose,
  onSaved,
  anchoGeneral,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  anchoGeneral: number;
}) {
  const [imagen, setImagen] = useState<PickedImage | null>(null);
  const [nombre, setNombre] = useState('');
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [tamanoPropio, setTamanoPropio] = useState(false);
  const [ancho, setAncho] = useState(anchoGeneral);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setImagen(null);
      setNombre('');
      setInicio('');
      setFin('');
      setTamanoPropio(false);
      setAncho(anchoGeneral);
      setError(null);
    }
  }, [visible, anchoGeneral]);

  async function handleElegir() {
    try {
      // PNG y sin recorte: un logo necesita su fondo transparente y su forma original.
      const img = await pickAndCompressImage({ recortar: false, formato: 'png' });
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
      await crearLogo({
        nombre: nombre.trim(),
        imagenUrl: url,
        fechaInicio: fi,
        fechaFin: ff,
        anchoPct: tamanoPropio ? ancho : null,
      });
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
              <Text style={styles.imagenHint}>{'Toca para elegir la imagen\n(ideal: PNG con fondo transparente)'}</Text>
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

          <View style={styles.switchRow}>
            <View style={styles.switchTexto}>
              <Text style={styles.switchLabel}>Tamaño propio</Text>
              <Text style={styles.switchHint}>Apagado usa el tamaño general ({anchoGeneral} %).</Text>
            </View>
            <Switch
              value={tamanoPropio}
              onValueChange={setTamanoPropio}
              trackColor={{ false: Colors.inputBorder, true: Colors.accent }}
              thumbColor="#FFFFFF"
            />
          </View>
          {tamanoPropio && (
            <View style={styles.modalTamano}>
              <ControlTamano valor={ancho} onChange={setAncho} />
              {imagen ? (
                <View style={styles.modalPreview}>
                  <BrandLogoPreview url={imagen.uri} anchoPct={ancho} />
                </View>
              ) : null}
            </View>
          )}

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

/**
 * Ajustar el tamaño de un logo que ya existe. Se hace en su propio panel y no
 * en la fila de la lista para poder mostrar la vista previa a tamaño real
 * mientras se cambia: el logo es lo primero que se ve de la app y a ojo, en
 * una miniatura de 84 px, no se acierta.
 */
function TamanoLogoModal({
  logo,
  anchoGeneral,
  onClose,
  onSaved,
}: {
  logo: LogoTematico | null;
  anchoGeneral: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [propio, setPropio] = useState(false);
  const [ancho, setAncho] = useState(anchoGeneral);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (logo) {
      setPropio(logo.ancho_pct !== null);
      setAncho(logo.ancho_pct ?? anchoGeneral);
      setError(null);
    }
  }, [logo, anchoGeneral]);

  async function handleGuardar() {
    if (!logo) return;
    setSaving(true);
    setError(null);
    try {
      await actualizarAnchoLogo(logo.id, propio ? ancho : null);
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo guardar el tamaño.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={logo !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.sheetTitle}>Tamaño de “{logo?.nombre}”</Text>

          <View style={styles.modalPreview}>
            {logo ? <BrandLogoPreview url={logo.imagen_url} anchoPct={propio ? ancho : anchoGeneral} /> : null}
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchTexto}>
              <Text style={styles.switchLabel}>Tamaño propio</Text>
              <Text style={styles.switchHint}>Apagado usa el tamaño general ({anchoGeneral} %).</Text>
            </View>
            <Switch
              value={propio}
              onValueChange={setPropio}
              trackColor={{ false: Colors.inputBorder, true: Colors.accent }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.modalTamano}>
            <ControlTamano valor={propio ? ancho : anchoGeneral} onChange={setAncho} deshabilitado={!propio} />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button label={saving ? 'Guardando…' : 'Guardar'} onPress={handleGuardar} loading={saving} />
          <Pressable onPress={onClose} style={styles.cancelRow}>
            <Text style={styles.cancelLabel}>Cancelar</Text>
          </Pressable>
        </Pressable>
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
    paddingVertical: Spacing.four,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  previewNota: {
    fontFamily: Fonts.light,
    fontSize: 12,
    lineHeight: 17,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: Spacing.three,
  },
  previewLabel: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    letterSpacing: 0.6,
    color: Colors.textMuted,
  },
  tamanoBox: {
    marginTop: Spacing.three,
    padding: Spacing.three,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
    gap: Spacing.two,
  },
  tamanoTitulo: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: Colors.text,
  },
  tamanoAyuda: {
    fontFamily: Fonts.light,
    fontSize: 12.5,
    lineHeight: 18,
    color: Colors.textMuted,
  },
  tamanoAcciones: {
    gap: Spacing.two,
    alignItems: 'center',
  },
  tamanoEstado: {
    fontFamily: Fonts.light,
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  deshacer: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: Colors.textMuted,
  },
  tamanoLink: {
    fontFamily: Fonts.medium,
    fontSize: 11.5,
    color: Colors.accent,
    marginTop: 4,
  },
  modalTamano: {
    marginBottom: Spacing.three,
    gap: Spacing.three,
  },
  modalPreview: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: 12,
    backgroundColor: Colors.background,
    marginBottom: Spacing.three,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  switchTexto: {
    flex: 1,
  },
  switchLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.cardText,
  },
  switchHint: {
    fontFamily: Fonts.light,
    fontSize: 12,
    color: Colors.cardTextMuted,
    marginTop: 2,
  },
  ayuda: {
    fontFamily: Fonts.light,
    marginTop: Spacing.three,
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
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    padding: Spacing.four,
    paddingBottom: Spacing.six,
  },
  sheetTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 17,
    color: Colors.cardText,
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
    borderBottomColor: Colors.inputBorder,
    paddingVertical: Spacing.two,
    fontSize: 16,
    color: Colors.cardText,
    marginBottom: Spacing.three,
  },
  fechasRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  inputFecha: {
    flex: 1,
    fontSize: 14,
    marginBottom: Spacing.one,
  },
  fechasHint: {
    fontFamily: Fonts.light,
    fontSize: 12,
    color: Colors.cardTextMuted,
    marginBottom: Spacing.two,
  },
  errorText: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.danger,
    marginBottom: Spacing.two,
  },
  cancelRow: {
    marginTop: Spacing.two,
    alignItems: 'center',
  },
  cancelLabel: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: Colors.cardTextMuted,
  },
});
