import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState, LoadingState } from '@/components/catalog/CatalogState';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import {
  ImagenHuerfana,
  MESES_DE_RETENCION,
  Purgables,
  buscarImagenesHuerfanas,
  comprimirClicsAntiguos,
  contarPurgables,
  eliminarImagenesHuerfanas,
  purgarBannersVencidos,
  purgarPublicacionesBorradas,
} from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';

const ETIQUETA_BUCKET: Record<string, string> = {
  logos: 'Logos de comercios',
  productos: 'Fotos de productos',
  banners: 'Banners',
};

function pesoLegible(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function fechaLegible(iso: string | null): string {
  if (!iso) return 'sin fecha';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Archivos que ocupan espacio y ya no usa nadie: quedaron de un borrado que
 * falló, de una foto reemplazada o de un formulario abandonado a medias.
 *
 * La pantalla primero MUESTRA lo que se iría y solo borra cuando el admin lo
 * confirma. No es automático a propósito: borrar archivos no se deshace, y el
 * cálculo de "ya no se usa" depende de revisar todas las tablas que guardan
 * imágenes — el día que se agregue una tabla nueva y se olvide sumarla, un
 * barrido automático borraría fotos en uso sin que nadie se entere.
 *
 * Los logos temáticos quedan fuera por decisión explícita: uno vencido se
 * reutiliza al año siguiente y es al que la app vuelve cuando caduca el de
 * encima.
 */
export default function LimpiezaScreen() {
  const router = useRouter();
  const [imagenes, setImagenes] = useState<ImagenHuerfana[]>([]);
  const [loading, setLoading] = useState(true);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [purgables, setPurgables] = useState<Purgables | null>(null);
  const [faltaMigracion, setFaltaMigracion] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFaltaMigracion(false);
    try {
      setImagenes(await buscarImagenesHuerfanas());
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo revisar el almacenamiento.'));
    }
    // El recuento de contenido vencido vive en la base (migración 0022). Va
    // aparte para que, si esa migración todavía no está aplicada, la limpieza
    // de imágenes siga funcionando igual.
    try {
      setPurgables(await contarPurgables());
    } catch {
      setFaltaMigracion(true);
      setPurgables(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const total = imagenes.reduce((suma, i) => suma + i.bytes, 0);

  /** Pregunta, ejecuta y vuelve a contar. La confirmación dice qué se pierde. */
  function confirmar(titulo: string, mensaje: string, accion: () => Promise<string>) {
    Alert.alert(titulo, mensaje, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Continuar',
        style: 'destructive',
        onPress: async () => {
          setBorrando(true);
          setError(null);
          try {
            setResultado(await accion());
            await load();
          } catch (err) {
            setError(getErrorMessage(err, 'No se pudo completar la limpieza.'));
          } finally {
            setBorrando(false);
          }
        },
      },
    ]);
  }

  function handleBorrar() {
    Alert.alert(
      'Borrar archivos sin usar',
      `Se borrarán ${imagenes.length} ${imagenes.length === 1 ? 'archivo' : 'archivos'} (${pesoLegible(total)}). ` +
        'No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            setBorrando(true);
            setError(null);
            try {
              const borradas = await eliminarImagenesHuerfanas(imagenes);
              setResultado(`Se liberaron ${pesoLegible(total)} en ${borradas} archivos.`);
              await load();
            } catch (err) {
              setError(getErrorMessage(err, 'No se pudieron borrar los archivos.'));
            } finally {
              setBorrando(false);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      <EncabezadoMarca subtitulo="Limpieza" onVolver={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.ayuda}>
          Imágenes que siguen ocupando espacio y ya no usa ninguna publicación, comercio ni banner. Se revisan solo las
          que llevan más de 48 horas subidas, para no tocar una foto que alguien esté subiendo en este momento.
        </Text>

        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={load} />}
        {resultado ? <Text style={styles.resultado}>{resultado}</Text> : null}

        {!loading && !error && imagenes.length === 0 && (
          <Text style={styles.limpio}>No hay archivos sin usar. El almacenamiento está limpio.</Text>
        )}

        {!loading && !error && imagenes.length > 0 && (
          <>
            <View style={styles.resumen}>
              <Text style={styles.resumenNumero}>{imagenes.length}</Text>
              <Text style={styles.resumenTexto}>
                {imagenes.length === 1 ? 'archivo sin usar' : 'archivos sin usar'} · {pesoLegible(total)}
              </Text>
            </View>

            {imagenes.map((imagen) => (
              <View key={`${imagen.bucket}/${imagen.ruta}`} style={styles.fila}>
                <View style={styles.filaTexto}>
                  <Text style={styles.filaNombre} numberOfLines={1}>
                    {imagen.nombre}
                  </Text>
                  <Text style={styles.filaDetalle}>
                    {ETIQUETA_BUCKET[imagen.bucket] ?? imagen.bucket} · subida el {fechaLegible(imagen.creada)}
                  </Text>
                </View>
                <Text style={styles.filaPeso}>{pesoLegible(imagen.bytes)}</Text>
              </View>
            ))}

            <Pressable
              style={({ pressed }) => [styles.boton, pressed && styles.botonPresionado]}
              onPress={handleBorrar}
              disabled={borrando}>
              <Text style={styles.botonLabel}>{borrando ? 'Borrando…' : 'Borrar estos archivos'}</Text>
            </Pressable>
          </>
        )}

        {/* Contenido vencido: filas de la base, no archivos. Va aparte porque
            lo que se pierde es distinto —campañas y publicaciones dadas de
            baja— y merece su propia decisión. */}
        {!loading && purgables && (
          <View style={styles.seccion}>
            <Text style={styles.seccionTitulo}>Contenido vencido</Text>
            <Text style={styles.ayuda}>
              Se conserva {MESES_DE_RETENCION} meses por si hay que recuperarlo: un comerciante que renueva su campaña
              quiere su mismo diseño, y un comercio que vuelve, sus fotos.
            </Text>

            <FilaPurga
              etiqueta="Banners vencidos"
              detalle={`Vencidos hace más de ${MESES_DE_RETENCION} meses, con su imagen`}
              cantidad={purgables.bannersVencidos}
              onPress={() =>
                confirmar(
                  'Borrar banners vencidos',
                  `Se borrarán ${purgables.bannersVencidos} banners y sus imágenes. No se puede deshacer.`,
                  async () => `Se borraron ${await purgarBannersVencidos()} banners.`,
                )
              }
            />

            <FilaPurga
              etiqueta="Publicaciones dadas de baja"
              detalle={`De baja hace más de ${MESES_DE_RETENCION} meses, con sus fotos`}
              cantidad={purgables.publicacionesBorradas}
              onPress={() =>
                confirmar(
                  'Borrar publicaciones dadas de baja',
                  `Se borrarán ${purgables.publicacionesBorradas} publicaciones con sus productos y fotos. ` +
                    'No se puede deshacer.',
                  async () => `Se borraron ${await purgarPublicacionesBorradas()} publicaciones.`,
                )
              }
            />

            <FilaPurga
              etiqueta="Clics de WhatsApp antiguos"
              detalle="Más de 90 días: pasan a ser totales por día"
              cantidad={purgables.clics}
              onPress={() =>
                confirmar(
                  'Comprimir métricas antiguas',
                  `${purgables.clics} clics de más de 90 días pasarán a guardarse como totales por día. ` +
                    'Las métricas del panel siguen mostrando lo mismo; solo se pierde el detalle de cada clic.',
                  async () => `Se comprimieron ${await comprimirClicsAntiguos()} clics.`,
                )
              }
            />
          </View>
        )}

        {faltaMigracion && (
          <View style={styles.seccion}>
            <Text style={styles.seccionTitulo}>Contenido vencido</Text>
            <Text style={styles.ayuda}>
              Para purgar banners y publicaciones viejas y comprimir las métricas hay que ejecutar la migración
              0022_retencion_de_datos.sql en el editor SQL de Supabase. La limpieza de imágenes de arriba funciona igual.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Una cosa purgable: cuántas hay y el botón para hacerlo. */
function FilaPurga({
  etiqueta,
  detalle,
  cantidad,
  onPress,
}: {
  etiqueta: string;
  detalle: string;
  cantidad: number;
  onPress: () => void;
}) {
  const hay = cantidad > 0;
  return (
    <View style={styles.purgaFila}>
      <View style={styles.filaTexto}>
        <Text style={[styles.filaNombre, !hay && styles.filaNombreVacia]}>{etiqueta}</Text>
        <Text style={styles.filaDetalle}>{detalle}</Text>
      </View>
      {hay ? (
        <Pressable style={styles.purgaBoton} onPress={onPress}>
          <Text style={styles.purgaBotonLabel}>{cantidad}</Text>
        </Pressable>
      ) : (
        <Text style={styles.purgaNada}>0</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.six,
  },
  ayuda: {
    fontFamily: Fonts.light,
    fontSize: 12.5,
    lineHeight: 18,
    color: Colors.textMuted,
    marginBottom: Spacing.four,
  },
  limpio: {
    fontFamily: Fonts.light,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  resultado: {
    fontFamily: Fonts.medium,
    fontSize: 13.5,
    color: Colors.success,
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  resumen: {
    alignItems: 'center',
    paddingVertical: Spacing.four,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
    marginBottom: Spacing.three,
  },
  resumenNumero: {
    fontFamily: Fonts.light,
    fontSize: 40,
    color: Colors.accent,
  },
  resumenTexto: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.textMuted,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  filaTexto: {
    flex: 1,
  },
  filaNombre: {
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.text,
  },
  filaDetalle: {
    fontFamily: Fonts.light,
    fontSize: 11.5,
    color: Colors.textMuted,
    marginTop: 2,
  },
  filaPeso: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: Colors.textMuted,
  },
  seccion: {
    marginTop: Spacing.six,
  },
  seccionTitulo: {
    fontFamily: Fonts.light,
    fontSize: 21,
    color: Colors.accent,
    marginBottom: Spacing.two,
  },
  purgaFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  filaNombreVacia: {
    color: Colors.textMuted,
  },
  purgaBoton: {
    minWidth: 46,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.danger,
    alignItems: 'center',
  },
  purgaBotonLabel: {
    fontFamily: Fonts.medium,
    fontSize: 15,
    color: Colors.danger,
  },
  purgaNada: {
    fontFamily: Fonts.light,
    fontSize: 15,
    color: Colors.textMuted,
    minWidth: 46,
    textAlign: 'center',
  },
  boton: {
    marginTop: Spacing.five,
    paddingVertical: Spacing.four,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.danger,
    alignItems: 'center',
  },
  botonPresionado: {
    backgroundColor: Colors.surface,
  },
  botonLabel: {
    fontFamily: Fonts.light,
    fontSize: 19,
    color: Colors.danger,
  },
});
