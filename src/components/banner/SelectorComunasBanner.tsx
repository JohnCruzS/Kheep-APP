import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonPie } from '@/components/ui/BotonPie';
import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Interruptor } from '@/components/ui/Interruptor';
import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing, TarjetaLista } from '@/constants/theme';
import type { Comuna } from '@/lib/catalog';
import { SEPARACION_TARJETA, useAltoTarjeta } from '@/lib/altoTarjeta';
import { REJILLA, u } from '@/lib/rejilla';
import { compararRegiones, nombreRegion } from '@/lib/regiones';

/**
 * Dónde se muestra el banner de un comerciante (maqueta del cliente): una
 * tarjeta por región con su interruptor. Tocar el nombre de la región la
 * despliega (sin elegir nada) para elegir comunas sueltas; el interruptor de
 * la región elige o quita todas sus comunas de una vez (pedido del cliente).
 *
 * Abajo, el botón rojo con lo que va costando: los días por la suma del
 * precio de las comunas elegidas. Tocarlo confirma la elección.
 */
export function SelectorComunasBanner({
  visible,
  comunas,
  elegidas,
  dias,
  precioDe,
  onListo,
  onClose,
}: {
  visible: boolean;
  comunas: Comuna[];
  elegidas: string[];
  dias: number;
  /** Precio por día de una comuna (el suyo, el de su región o el base). */
  precioDe: (comunaId: string) => number;
  onListo: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  /** Las regiones desplegadas (tocando su nombre). */
  const [abiertas, setAbiertas] = useState<string[]>([]);
  const altoTarjeta = useAltoTarjeta();

  // Cada vez que se abre parte de lo que ya estaba elegido, con desplegadas
  // las regiones donde hay algo elegido.
  useEffect(() => {
    if (!visible) return;
    setSeleccion(new Set(elegidas));
    setAbiertas([...new Set(comunas.filter((c) => elegidas.includes(c.id)).map((c) => c.region ?? ''))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, elegidas]);

  const regiones = useMemo(
    () => [...new Set(comunas.map((c) => c.region ?? ''))].sort(compararRegiones),
    [comunas],
  );
  const comunasDe = (region: string) => comunas.filter((c) => (c.region ?? '') === region);
  const total = dias * [...seleccion].reduce((suma, id) => suma + precioDe(id), 0);

  function alternarRegion(region: string, encender: boolean) {
    setSeleccion((s) => {
      const nueva = new Set(s);
      for (const c of comunasDe(region)) {
        if (encender) nueva.add(c.id);
        else nueva.delete(c.id);
      }
      return nueva;
    });
  }

  function alternarComuna(id: string) {
    setSeleccion((s) => {
      const nueva = new Set(s);
      if (nueva.has(id)) nueva.delete(id);
      else nueva.add(id);
      return nueva;
    });
  }

  return (
    <Modal visible={visible} animationType="none" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <EncabezadoMarca subtitulo="Banners" />
        <ScrollView contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false}>
          {regiones.map((region) => {
            const suyas = comunasDe(region);
            const elegidasAca = suyas.filter((c) => seleccion.has(c.id)).length;
            const encendida = elegidasAca > 0;
            const abierta = abiertas.includes(region);
            return (
              <View key={region} style={styles.tarjeta}>
                <View style={[styles.cabecera, { height: altoTarjeta - 2 }]}>
                  {/* El nombre despliega la región; el interruptor la elige entera. */}
                  <Pressable
                    style={styles.zonaNombre}
                    onPress={() => setAbiertas((a) => (a.includes(region) ? a.filter((r) => r !== region) : [...a, region]))}
                    accessibilityRole="button"
                    accessibilityLabel={`Ver las comunas de ${nombreRegion(region)}`}>
                    <Text style={styles.region} numberOfLines={1}>
                      {nombreRegion(region)}
                    </Text>
                  </Pressable>
                  <Interruptor
                    value={encendida}
                    onValueChange={(v) => alternarRegion(region, v)}
                    accessibilityLabel={`Mostrar en ${nombreRegion(region)}`}
                  />
                </View>
                {abierta && (
                  <View style={styles.comunas}>
                    {suyas.map((comuna) => (
                      <Pressable key={comuna.id} style={styles.filaComuna} onPress={() => alternarComuna(comuna.id)}>
                        <Text style={styles.comuna} numberOfLines={1}>
                          {comuna.nombre}
                        </Text>
                        <Interruptor
                          value={seleccion.has(comuna.id)}
                          onValueChange={() => alternarComuna(comuna.id)}
                          accessibilityLabel={`Mostrar en ${comuna.nombre}`}
                        />
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        {/* Lo que va costando; tocarlo confirma lo elegido. Mismo botón y
            misma altura que en las demás vistas. */}
        <BotonPie label={`$ ${total.toLocaleString('es-CL')}`} onPress={() => onListo([...seleccion])} />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contenido: {
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
  },
  tarjeta: {
    backgroundColor: TarjetaLista.fondo,
    borderRadius: u(REJILLA.curvatura),
    borderWidth: 1,
    borderColor: TarjetaLista.borde,
    marginBottom: SEPARACION_TARJETA,
    paddingHorizontal: TarjetaLista.sangria,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  zonaNombre: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
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
    fontSize: 22,
    color: Colors.text,
  },
});
