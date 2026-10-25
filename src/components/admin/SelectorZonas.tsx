import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Texto';
import { BotonPie } from '@/components/ui/BotonPie';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Interruptor } from '@/components/ui/Interruptor';
import { Colors, Fonts, Spacing, TarjetaLista } from '@/constants/theme';
import { SEPARACION_TARJETA, useAltoTarjeta } from '@/lib/altoTarjeta';
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
 *
 * Si las comunas traen si están visibles (`activa`), dos toques en el logo
 * pasan de todas las comunas ("Chile") a solo las visibles ("Visible") y
 * vuelven, igual que en Comunas.
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
  comunas: (Comuna & { activa?: boolean })[];
  elegidas: string[];
  onListo: (comunaIds: string[]) => void;
  onClose: () => void;
}) {
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [abierta, setAbierta] = useState<string | null>(null);
  const [soloVisibles, setSoloVisibles] = useState(false);
  // Las tarjetas, del alto de las del panel del admin (igual que en Comunas).
  const altoTarjeta = useAltoTarjeta();
  const conVisibilidad = comunas.some((c) => c.activa !== undefined);

  // Cada vez que se abre parte de lo que ya estaba elegido.
  useEffect(() => {
    if (!visible) return;
    setSeleccion(new Set(elegidas));
    setAbierta(null);
  }, [visible, elegidas]);

  const regiones = useMemo(() => {
    const porRegion = new Map<string, Comuna[]>();
    for (const comuna of soloVisibles ? comunas.filter((c) => c.activa !== false) : comunas) {
      const region = comuna.region ?? '';
      const lista = porRegion.get(region);
      if (lista) lista.push(comuna);
      else porRegion.set(region, [comuna]);
    }
    return [...porRegion.entries()].sort(([a], [b]) => compararRegiones(a, b));
  }, [comunas, soloVisibles]);

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
        <EncabezadoMarca
          subtitulo={soloVisibles ? 'Visible' : 'Chile'}
          onDobleToque={conVisibilidad ? () => setSoloVisibles((v) => !v) : undefined}
        />

        <ScrollView contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false}>
          {regiones.map(([region, lista]) => {
            const prendidas = lista.filter((c) => seleccion.has(c.id)).length;
            const estaAbierta = abierta === region;
            return (
              <View key={region} style={styles.tarjeta}>
                <View style={[styles.cabecera, { height: altoTarjeta - 2 }]}>
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

        <BotonPie label="Listo" onPress={() => onListo([...seleccion])} />
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
  // Igual que las tarjetas de Comunas: negras, con el borde tenue, del alto
  // de las del panel y con su misma letra (pedido del cliente).
  tarjeta: {
    backgroundColor: TarjetaLista.fondo,
    borderRadius: u(REJILLA.curvatura),
    borderWidth: 1,
    borderColor: TarjetaLista.borde,
    marginBottom: SEPARACION_TARJETA,
    overflow: 'hidden',
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: TarjetaLista.sangria,
  },
  zonaNombre: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  region: {
    fontFamily: Fonts.tarjeta,
    flexShrink: 1,
    fontSize: TarjetaLista.tamanoTexto,
    lineHeight: TarjetaLista.altoLinea,
    color: Colors.text,
  },
  contador: {
    fontFamily: Fonts.medium,
    fontSize: 21,
    color: Colors.textMuted,
  },
  filaComuna: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: 47,
    paddingRight: TarjetaLista.sangria,
    paddingVertical: Spacing.two,
  },
  comuna: {
    fontFamily: Fonts.delgada,
    flex: 1,
    fontSize: 27,
    color: Colors.text,
  },
});
