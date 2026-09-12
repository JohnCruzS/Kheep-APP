import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/ui/BrandLogo';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { Comuna, fetchComunas } from '@/lib/catalog';
import { detectarComunaActual, pedirPermisoUbicacion } from '@/lib/location';
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

  return (
    <View style={styles.pantallaLogo}>
      <BrandLogo />
      {paso === 'identificando' && (
        <View style={styles.cargando}>
          <ActivityIndicator color={Colors.accent} />
          <Text style={styles.cargandoTexto}>Identificando tu comuna…</Text>
        </View>
      )}
    </View>
  );
}

/**
 * Elegir la comuna a mano. Es la misma lista del selector del catálogo —con
 * buscador, porque son ~346 comunas— pero a pantalla completa: acá no es un
 * filtro más, es el paso que falta para poder mostrar algo.
 */
function ListaComunas({ comunas, onElegir }: { comunas: Comuna[]; onElegir: (id: string | null) => void }) {
  const [busqueda, setBusqueda] = useState('');

  const filas = useMemo(() => {
    const termino = normalizarTexto(busqueda);
    if (!termino) return comunas;
    return comunas.filter((c) => normalizarTexto(c.nombre).includes(termino));
  }, [comunas, busqueda]);

  return (
    <SafeAreaView style={styles.pantallaLista} edges={['top', 'bottom']}>
      <View style={styles.listaEncabezado}>
        <BrandLogo height={34} />
        <Text style={styles.titulo}>¿En qué comuna estás?</Text>
        <Text style={styles.subtitulo}>Elígela para ver los comercios que tienes cerca.</Text>
      </View>

      <TextInput
        placeholder="Buscar comuna"
        placeholderTextColor={Colors.placeholder}
        value={busqueda}
        onChangeText={setBusqueda}
        style={styles.buscador}
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
  pantallaLogo: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cargando: {
    position: 'absolute',
    bottom: '22%',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cargandoTexto: {
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.textMuted,
  },
  pantallaLista: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listaEncabezado: {
    alignItems: 'center',
    paddingTop: Spacing.five,
    paddingHorizontal: Spacing.four,
  },
  titulo: {
    fontFamily: Fonts.semiBold,
    marginTop: Spacing.four,
    fontSize: 19,
    color: Colors.text,
  },
  subtitulo: {
    fontFamily: Fonts.light,
    marginTop: Spacing.two,
    fontSize: 13.5,
    lineHeight: 19,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  buscador: {
    fontFamily: Fonts.light,
    margin: Spacing.four,
    marginBottom: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    fontSize: 15,
    color: Colors.text,
  },
  cargandoLista: {
    flex: 1,
    justifyContent: 'center',
  },
  listaContenido: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  fila: {
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  filaLabel: {
    fontFamily: Fonts.light,
    fontSize: 16,
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
