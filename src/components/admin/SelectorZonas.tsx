import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Interruptor } from '@/components/ui/Interruptor';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import type { Comuna } from '@/lib/catalog';
import { REJILLA, u } from '@/lib/rejilla';
import { compararRegiones, nombreRegion } from '@/lib/regiones';

/**
 * Dónde se muestra un banner: regiones y comunas con interruptores
 * (documento EDIT APP, "Publicación banner, Región - Comuna").
 *
 * Cada región es una tarjeta, de norte a sur. Su interruptor prende o apaga
 * todas sus comunas de una vez; tocando el nombre se abre para elegir comunas
 * sueltas. Lo elegido solo se aplica con "Listo".
 */
export function SelectorZonas({
  visible,
  comunas,
  elegidas,
  onListo,
  onClose,
}: {
  visible: boolean;
  /** Las comunas entre las que se puede elegir (a un admin de zona, solo las suyas). */
  comunas: Comuna[];
  elegidas: string[];
  onListo: (comunaIds: string[]) => void;
  onClose: () => void;
}) {
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [abierta, setAbierta] = useState<string | null>(null);

  // Cada vez que se abre parte de lo que ya estaba elegido.
  useEffect(() => {
    if (!visible) return;
    setSeleccion(new Set(elegidas));
    setAbierta(null);
  }, [visible, elegidas]);

  const regiones = useMemo(() => {
    const porRegion = new Map<string, Comuna[]>();
    for (const comuna of comunas) {
      const region = comuna.region ?? '';
      const lista = porRegion.get(region);
      if (lista) lista.push(comuna);
      else porRegion.set(region, [comuna]);
    }
    return [...porRegion.entries()].sort(([a], [b]) => compararRegiones(a, b));
  }, [comunas]);

  function alternarRegion(lista: Comuna[], prender: boolean) {
    setSeleccion((actual) => {
      const nueva = new Set(actual);
      for (const c of lista) {
        if (prender) nueva.add(c.id);
        else nueva.delete(c.id);
      }
      return nueva;
    });
  }

  function alternarComuna(id: string) {
    setSeleccion((actual) => {
      const nueva = new Set(actual);
      if (nueva.has(id)) nueva.delete(id);
      else nueva.add(id);
      return nueva;
    });
  }

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.pantalla} edges={['top', 'bottom']}>
        <EncabezadoMarca subtitulo="Chile" onVolver={onClose} />

        <ScrollView contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false}>
          {regiones.map(([region, lista]) => {
            const prendidas = lista.filter((c) => seleccion.has(c.id)).length;
            const estaAbierta = abierta === region;
            return (
              <View key={region} style={styles.tarjeta}>
                <View style={styles.cabecera}>
                  <Pressable
                    style={styles.zonaNombre}
                    onPress={() => setAbierta(estaAbierta ? null : region)}
                    accessibilityRole="button">
                    <Text style={styles.region} numberOfLines={1}>
                      {nombreRegion(region)}
                    </Text>
                    {/* Solo si está a medias: prendida entera o apagada entera
                        ya lo dice el interruptor. */}
                    {prendidas > 0 && prendidas < lista.length && (
                      <Text style={styles.contador}>{`${prendidas}/${lista.length}`}</Text>
                    )}
                  </Pressable>
                  <Interruptor
                    value={prendidas === lista.length}
                    onValueChange={(prender) => alternarRegion(lista, prender)}
                    accessibilityLabel={`Mostrar en toda la región de ${nombreRegion(region)}`}
                  />
                </View>

                {estaAbierta &&
                  lista.map((comuna) => (
                    <View key={comuna.id} style={styles.filaComuna}>
                      <Text style={styles.comuna} numberOfLines={1}>
                        {'-  '}
                        {comuna.nombre}
                      </Text>
                      <Interruptor
                        value={seleccion.has(comuna.id)}
                        onValueChange={() => alternarComuna(comuna.id)}
                        accessibilityLabel={`Mostrar en ${comuna.nombre}`}
                      />
                    </View>
                  ))}
              </View>
            );
          })}
        </ScrollView>

        <Pressable
          style={({ pressed }) => [styles.listo, pressed && styles.listoPresionado]}
          onPress={() => onListo([...seleccion])}
          accessibilityRole="button">
          <Text style={styles.listoLabel}>Listo</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contenido: {
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingBottom: Spacing.four,
  },
  tarjeta: {
    backgroundColor: Colors.surface,
    borderRadius: u(REJILLA.curvatura),
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: Spacing.two,
    overflow: 'hidden',
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  zonaNombre: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  region: {
    fontFamily: Fonts.medium,
    flexShrink: 1,
    fontSize: 23,
    color: Colors.text,
  },
  contador: {
    fontFamily: Fonts.medium,
    fontSize: 15,
    color: Colors.accent,
  },
  filaComuna: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.five,
    paddingRight: Spacing.four,
    paddingVertical: Spacing.two,
  },
  comuna: {
    fontFamily: Fonts.light,
    flex: 1,
    fontSize: 21,
    color: Colors.text,
  },
  listo: {
    marginHorizontal: u(REJILLA.margenLateral),
    marginBottom: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: u(REJILLA.curvatura),
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  listoPresionado: {
    backgroundColor: Colors.accentPressed,
  },
  listoLabel: {
    fontFamily: Fonts.medium,
    fontSize: 21,
    color: '#FFFFFF',
  },
});
