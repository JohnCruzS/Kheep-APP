import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TituloPosicionado } from '@/components/ui/BrandLogo';
import { PantallaArranque } from '@/components/ui/PantallaArranque';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { Comuna, fetchComunas } from '@/lib/catalog';
import { detectarComunaActual, pedirPermisoUbicacion } from '@/lib/location';
import { PERIMETRO_ALTO, useMarca } from '@/lib/marca';
import { REJILLA, u } from '@/lib/rejilla';
import { normalizarTexto } from '@/lib/text';
import { useUbicacion } from '@/providers/UbicacionProvider';

/**
 * Cuánto se queda el fondo negro con el logo antes de abrir el diálogo del
 * sistema y otra vez después de responderlo. Sin esta pausa el permiso salta
 * encima de una pantalla todavía en blanco y, al responder, el contenido
 * aparece de golpe: se siente como un salto, no como un arranque.
 */
const PAUSA_LOGO = 700;

/**
 * Lo mínimo que se muestra "Identificando tu comuna…". El GPS a veces
 * responde en 200 ms y el cartel alcanzaría a parpadear sin que nadie lo lea.
 */
const MINIMO_IDENTIFICANDO = 1500;

type Paso =
  /** Fondo negro con el logo: al entrar y otra vez al responder el permiso. */
  | 'logo'
  /** Diálogo del sistema abierto encima del fondo negro. */
  | 'permiso'
  /** Dio permiso: buscando en qué comuna está. */
  | 'identificando'
  /** Sin permiso, o no se pudo identificar: la elige a mano. */
  | 'manual';

const esperar = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

/**
 * Arranque de la app la primera vez que se abre.
 *
 * Fondo negro con el logo → se pide el permiso de ubicación → vuelve al fondo
 * negro → y de ahí se bifurca:
 *
 *  - Dio permiso: "Identificando tu comuna…" y, cuando la encuentra, entra al
 *    catálogo ya filtrado por ella.
 *  - No dio permiso: la lista de comunas para elegirla a mano; el catálogo
 *    aparece recién al elegir.
 *  - Dio permiso pero no se pudo identificar (sin señal, GPS apagado, fuera
 *    de Chile): termina en esa misma lista manual. El permiso queda
 *    concedido igual, así que las próximas veces no se vuelve a preguntar.
 *
 * Pasa una sola vez: la comuna queda guardada en el teléfono (ver
 * `src/lib/arranque.ts`) y en las siguientes aperturas se entra directo.
 */
export function BienvenidaUbicacion() {
  const { elegirComuna } = useUbicacion();
  const [paso, setPaso] = useState<Paso>('logo');
  const [comunas, setComunas] = useState<Comuna[]>([]);

  // Las comunas se piden desde el primer instante, en paralelo con el permiso
  // y el GPS: si se dejaran para cuando hacen falta, quien rechaza el permiso
  // vería la lista vacía unos segundos.
  const comunasRef = useRef<Promise<Comuna[]> | null>(null);
  if (comunasRef.current === null) {
    comunasRef.current = fetchComunas().catch(() => []);
  }

  useEffect(() => {
    let vivo = true;

    async function arrancar() {
      const listaPendiente = comunasRef.current!;
      listaPendiente.then((lista) => vivo && setComunas(lista));

      await esperar(PAUSA_LOGO);
      if (!vivo) return;

      setPaso('permiso');
      const concedido = await pedirPermisoUbicacion();
      if (!vivo) return;

      // Respondido el diálogo, se vuelve al fondo negro antes de seguir.
      setPaso('logo');
      await esperar(PAUSA_LOGO);
      if (!vivo) return;

      if (!concedido) {
        setPaso('manual');
        return;
      }

      setPaso('identificando');
      const [detectada] = await Promise.all([
        listaPendiente.then((lista) => detectarComunaActual(lista)),
        esperar(MINIMO_IDENTIFICANDO),
      ]);
      if (!vivo) return;

      if (detectada) elegirComuna(detectada);
      else setPaso('manual');
    }

    arrancar();
    return () => {
      vivo = false;
    };
  }, [elegirComuna]);

  if (paso === 'manual') {
    return <ListaComunas comunas={comunas} onElegir={elegirComuna} />;
  }

  // El logo, el permiso y la identificación son la MISMA vista: solo cambia
  // el texto de abajo. Antes el logo de aquí no era el del splash y el paso
  // de uno a otro se veía como un salto.
  return <PantallaArranque mensaje={paso === 'identificando' ? 'Identificando tu comuna…' : undefined} />;
}

/**
 * Elegir la comuna a mano. Es la misma lista del selector del catálogo —con
 * buscador, porque son ~346 comunas— pero a pantalla completa: acá no es un
 * filtro más, es el paso que falta para poder mostrar algo.
 */
function ListaComunas({ comunas, onElegir }: { comunas: Comuna[]; onElegir: (id: string | null) => void }) {
  const [busqueda, setBusqueda] = useState('');
  // Mismo diseño que el selector del catálogo (documento EDIT APP): el
  // título con "Chile" debajo, el buscador a la altura del banner y las
  // comunas centradas. Es la misma pregunta, así que se ve igual.
  const { width } = useWindowDimensions();
  const marca = useMarca();
  const unidad = width / 1000;

  const filas = useMemo(() => {
    const termino = normalizarTexto(busqueda);
    if (!termino) return comunas;
    return comunas.filter((c) => normalizarTexto(c.nombre).includes(termino));
  }, [comunas, busqueda]);

  return (
    <SafeAreaView style={styles.pantallaLista} edges={['top', 'bottom']}>
      <View style={{ height: Math.round(PERIMETRO_ALTO * unidad) }}>
        <TituloPosicionado
          unidad={unidad}
          altoPerimetro={PERIMETRO_ALTO}
          medidas={{ centroX: marca.centroX, ancho: marca.ancho, alto: marca.alto, centroY: marca.centroY }}
          url={marca.url}
          debajo={<Text style={styles.pais}>Chile</Text>}
        />
      </View>

      <TextInput
        placeholder="Buscar"
        placeholderTextColor={Colors.placeholder}
        value={busqueda}
        onChangeText={setBusqueda}
        style={[styles.buscador, { marginHorizontal: u(REJILLA.margenLateral) }]}
        autoCorrect={false}
      />

      {comunas.length === 0 ? (
        <View style={styles.cargandoLista}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={filas}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listaContenido}
          ListEmptyComponent={<Text style={styles.vacio}>No encontramos esa comuna.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.fila} onPress={() => onElegir(item.id)}>
              <Text style={styles.filaLabel}>{item.nombre}</Text>
            </Pressable>
          )}
        />
      )}

      {/* Salida para quien no encuentra su comuna o solo quiere mirar: entra
          al catálogo completo y puede cambiarla después desde el encabezado. */}
      <Pressable style={styles.todas} onPress={() => onElegir(null)} hitSlop={8}>
        <Text style={styles.todasLabel}>Ver todas las comunas</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantallaLista: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  pais: {
    fontFamily: Fonts.light,
    fontSize: 18,
    color: '#8A8A8A',
  },
  buscador: {
    fontFamily: Fonts.light,
    textAlign: 'center',
    paddingHorizontal: Spacing.three,
    height: 54,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 999,
    fontSize: 18,
    color: Colors.text,
  },
  cargandoLista: {
    flex: 1,
    justifyContent: 'center',
  },
  listaContenido: {
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  fila: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  filaLabel: {
    fontFamily: Fonts.light,
    fontSize: 19,
    textAlign: 'center',
    color: Colors.text,
  },
  vacio: {
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  todas: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  todasLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.accent,
  },
});
