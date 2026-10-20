import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Interruptor } from '@/components/ui/Interruptor';
import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing, TarjetaLista } from '@/constants/theme';
import type { Comuna } from '@/lib/catalog';
import { REJILLA, u } from '@/lib/rejilla';
import { compararRegiones, nombreRegion } from '@/lib/regiones';

/**
 * Dónde se muestra el banner de un comerciante (maqueta del cliente): una
 * tarjeta por región con su interruptor. Encenderla elige todas sus comunas
 * y las muestra adentro, cada una con el suyo para apagar las que no van;
 * apagarla quita todas.
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
  const insets = useSafeAreaInsets();
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  // Cada vez que se abre parte de lo que ya estaba elegido.
  useEffect(() => {
    if (visible) setSeleccion(new Set(elegidas));
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
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <EncabezadoMarca subtitulo="Banner" />
        <ScrollView contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false}>
          {regiones.map((region) => {
            const suyas = comunasDe(region);
            const elegidasAca = suyas.filter((c) => seleccion.has(c.id)).length;
            const encendida = elegidasAca > 0;
            return (
              <View key={region} style={styles.tarjeta}>
                <View style={styles.cabecera}>
                  <Text style={styles.region} numberOfLines={1}>
                    {nombreRegion(region)}
                  </Text>
                  <Interruptor
                    value={encendida}
                    onValueChange={(v) => alternarRegion(region, v)}
                    accessibilityLabel={`Mostrar en ${nombreRegion(region)}`}
                  />
                </View>
                {encendida && (
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

        {/* Lo que va costando; tocarlo confirma lo elegido. */}
        <View style={[styles.pie, { paddingBottom: Spacing.three + insets.bottom }]}>
          <Pressable
            style={({ pressed }) => [styles.boton, pressed && styles.botonPresionado]}
            onPress={() => onListo([...seleccion])}
            accessibilityRole="button"
            accessibilityLabel={`Listo, total ${total} pesos`}>
            <Text style={styles.botonLabel}>{`$ ${total.toLocaleString('es-CL')}`}</Text>
          </Pressable>
        </View>
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
    marginBottom: u(REJILLA.margenLateral),
    paddingHorizontal: TarjetaLista.sangria,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    height: u(240) - 2,
  },
  region: {
    flex: 1,
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
  pie: {
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingTop: Spacing.two,
  },
  boton: {
    paddingVertical: Spacing.four,
    borderRadius: u(REJILLA.curvatura),
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  botonPresionado: {
    backgroundColor: Colors.accentPressed,
  },
  botonLabel: {
    fontFamily: Fonts.medium,
    fontSize: 24,
    color: '#FFFFFF',
  },
});
