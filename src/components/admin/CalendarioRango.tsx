import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { BotonPie } from '@/components/ui/BotonPie';
import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { REJILLA, u } from '@/lib/rejilla';

/** Un lapso de días (AAAA-MM-DD, los dos incluidos); null = sin límite ("Todo"). */
export type Rango = { desde: string | null; hasta: string | null };

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const dos = (n: number) => String(n).padStart(2, '0');
/** AAAA-MM-DD de una fecha, con la hora del teléfono. */
export const isoDia = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const haceDias = (n: number) => isoDia(new Date(Date.now() - n * 86400000));
/** "15/10/2026". */
const legible = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Hoy (lo que muestran las métricas de entrada). */
export const rangoHoy = (): Rango => ({ desde: isoDia(new Date()), hasta: isoDia(new Date()) });

/** Cómo se lee un lapso: "Hoy", "Ayer", "15/10/2026", "01/10/2026 – 15/10/2026" o "Todo". */
export function textoRango(r: Rango): string {
  if (!r.desde) return 'Todo';
  const hoy = isoDia(new Date());
  if (r.desde === r.hasta) {
    if (r.desde === hoy) return 'Hoy';
    if (r.desde === haceDias(1)) return 'Ayer';
    return legible(r.desde);
  }
  return `${legible(r.desde)} – ${legible(r.hasta ?? hoy)}`;
}

/**
 * Elegir el día o el lapso de las métricas (pedido del cliente: se llega
 * tocando "Hoy"). Un toque en el mes elige un día y un segundo toque,
 * posterior, cierra el lapso. "Listo" lo aplica.
 */
export function CalendarioRango({
  visible,
  rango,
  onListo,
  onClose,
}: {
  visible: boolean;
  rango: Rango;
  onListo: (r: Rango) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [eleccion, setEleccion] = useState<Rango>(rango);
  const [mes, setMes] = useState(() => new Date());

  useEffect(() => {
    if (!visible) return;
    setEleccion(rango);
    setMes(rango.hasta ? new Date(`${rango.hasta}T12:00:00`) : new Date());
  }, [visible, rango]);

  const hoy = isoDia(new Date());
  const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
  // Lunes primero: getDay() da 0 al domingo.
  const vacios = (primero.getDay() + 6) % 7;
  const diasDelMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const celdas: (string | null)[] = [
    ...Array.from({ length: vacios }, () => null),
    ...Array.from({ length: diasDelMes }, (_, i) => isoDia(new Date(mes.getFullYear(), mes.getMonth(), i + 1))),
  ];

  function tocarDia(dia: string) {
    if (dia > hoy) return;
    // Sin lapso abierto (o tocando antes del inicio), empieza uno nuevo.
    if (!eleccion.desde || eleccion.desde !== eleccion.hasta || dia < eleccion.desde) {
      setEleccion({ desde: dia, hasta: dia });
    } else {
      setEleccion({ desde: eleccion.desde, hasta: dia });
    }
  }


  return (
    <Modal visible={visible} animationType="none" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <EncabezadoMarca subtitulo={textoRango(eleccion)} />

        <View style={styles.contenido}>

          {/* El mes, con flechas para ir al anterior o al siguiente. */}
          <View style={styles.cabeceraMes}>
            <Pressable onPress={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} hitSlop={14}>
              <Text style={styles.flecha}>{'<'}</Text>
            </Pressable>
            <Text style={styles.mes}>{`${MESES[mes.getMonth()]} ${mes.getFullYear()}`}</Text>
            <Pressable
              onPress={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
              disabled={isoDia(new Date(mes.getFullYear(), mes.getMonth() + 1, 1)) > hoy}
              hitSlop={14}>
              <Text style={styles.flecha}>{'>'}</Text>
            </Pressable>
          </View>

          <View style={styles.semana}>
            {DIAS.map((d, i) => (
              <Text key={i} style={styles.diaSemana}>
                {d}
              </Text>
            ))}
          </View>

          <View style={styles.grilla}>
            {celdas.map((dia, i) => {
              if (!dia) return <View key={`v${i}`} style={styles.celda} />;
              const dentro = !!eleccion.desde && dia >= eleccion.desde && dia <= (eleccion.hasta ?? eleccion.desde);
              const extremo = dia === eleccion.desde || dia === eleccion.hasta;
              const futuro = dia > hoy;
              return (
                <Pressable key={dia} style={styles.celda} onPress={() => tocarDia(dia)} disabled={futuro}>
                  <View style={[styles.punto, dentro && styles.puntoDentro, extremo && styles.puntoExtremo]}>
                    <Text style={[styles.numero, futuro && styles.numeroFuturo, extremo && styles.numeroExtremo]}>
                      {Number(dia.slice(8, 10))}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

        </View>
        <BotonPie label="Listo" onPress={() => onListo(eleccion)} />
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
    flex: 1,
    paddingHorizontal: u(REJILLA.margenLateral),
  },
  cabeceraMes: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
    marginBottom: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  flecha: {
    fontFamily: Fonts.delgada,
    fontSize: 28,
    color: Colors.accent,
  },
  mes: {
    fontFamily: Fonts.tarjeta,
    fontSize: 24,
    color: Colors.text,
  },
  semana: {
    flexDirection: 'row',
  },
  diaSemana: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.delgada,
    fontSize: 16,
    color: Colors.textMuted,
    paddingVertical: Spacing.two,
  },
  grilla: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  celda: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  punto: {
    width: '84%',
    height: '84%',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Los días del lapso, en rojo apagado; los extremos, en rojo pleno.
  puntoDentro: {
    backgroundColor: 'rgba(217,8,4,0.25)',
  },
  puntoExtremo: {
    backgroundColor: Colors.accent,
  },
  numero: {
    fontFamily: Fonts.delgada,
    fontSize: 20,
    color: Colors.text,
  },
  numeroFuturo: {
    color: '#3A3A3A',
  },
  numeroExtremo: {
    fontFamily: Fonts.medium,
    color: '#FFFFFF',
  },
  listo: {
    marginTop: 'auto',
    paddingVertical: Spacing.four,
    borderRadius: u(REJILLA.curvatura),
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  presionado: {
    backgroundColor: Colors.accentPressed,
  },
  listoLabel: {
    fontFamily: Fonts.medium,
    fontSize: 21,
    color: '#FFFFFF',
  },
});
