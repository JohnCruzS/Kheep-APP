import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Texto';

import { Interruptor } from '@/components/ui/Interruptor';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { MEDIDA_MAX } from '@/lib/marca';

/**
 * El toque mueve la medida de uno en uno, para poder dejarla en el número
 * exacto. Mantener apretado avanza de 25 en 25, que es lo que hace llevadero
 * recorrer una rejilla de 1000 sin perder la precisión del toque simple.
 */
const PASO = 1;
const PASO_LARGO = 25;

/**
 * Una medida del título (centro, ancho o alto) en la rejilla de 1000 del
 * cliente, con su interruptor de guía.
 *
 * Son botones y no una barra deslizante a propósito: un deslizador necesita
 * una dependencia nativa (que obliga a recompilar la app) y, sobre todo, el
 * dedo taparía justo el logo que se está mirando.
 */
export function ControlMedida({
  etiqueta,
  valor,
  onChange,
  guia,
  onGuia,
  min = 0,
  max = MEDIDA_MAX,
  referencia = MEDIDA_MAX,
  margen,
}: {
  etiqueta: string;
  valor: number;
  onChange: (nuevo: number) => void;
  /** Si su guía está encendida en la vista previa. */
  guia: boolean;
  onGuia: (encendida: boolean) => void;
  min?: number;
  max?: number;
  /**
   * Contra qué total se lee la medida. Casi siempre es la pantalla (1000),
   * pero el alto se mueve dentro del perímetro y se lee contra sus 340: decir
   * "175 de 1000" cuando el tope real es 340 confunde más que ayuda.
   */
  referencia?: number;
  /**
   * Hasta dónde se puede llevar la medida sin que el título o el texto de
   * debajo toquen lo que los rodea (la barra de arriba, el banner, los
   * bordes). Al llegar ahí el botón no avanza más y aparece un aviso corto.
   */
  margen?: { min?: number; max?: number };
}) {
  const [aviso, setAviso] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  const tope = Math.min(max, margen?.max ?? max);
  const piso = Math.max(min, margen?.min ?? min);

  const avisar = () => {
    setAviso(true);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setAviso(false), 2500);
  };

  const mover = (paso: number) => {
    const destino = valor + paso;
    // Hacia afuera del margen no se pasa: se queda en el borde y, si el borde
    // es el margen (no el tope duro de la medida), se avisa.
    if (paso > 0 && destino > tope) {
      if (valor < tope) onChange(tope);
      if (tope < max) avisar();
      return;
    }
    if (paso < 0 && destino < piso) {
      if (valor > piso) onChange(piso);
      if (piso > min) avisar();
      return;
    }
    onChange(destino);
  };
  const enTope = valor >= tope;
  const enPiso = valor <= piso;

  return (
    <View style={styles.bloque}>
      <View style={styles.cabecera}>
        <Text style={styles.etiqueta}>{etiqueta}</Text>
        <Interruptor
          value={guia}
          onValueChange={onGuia}
          accessibilityLabel={`Mostrar la guía de ${etiqueta.toLowerCase()} en el ejemplo`}
        />
      </View>

      <View style={styles.control}>
        <Pressable
          style={styles.boton}
          onPress={() => mover(-PASO)}
          onLongPress={() => mover(-PASO_LARGO)}
          disabled={valor <= min}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Bajar ${etiqueta.toLowerCase()}`}>
          <Text style={[styles.signo, enPiso && styles.signoApagado]}>−</Text>
        </Pressable>

        <Text style={styles.valor}>
          {valor} - {referencia}
        </Text>

        <Pressable
          style={styles.boton}
          onPress={() => mover(PASO)}
          onLongPress={() => mover(PASO_LARGO)}
          disabled={valor >= max}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Subir ${etiqueta.toLowerCase()}`}>
          <Text style={[styles.signo, enTope && styles.signoApagado]}>+</Text>
        </Pressable>
      </View>

      {aviso && <Text style={styles.aviso}>Se recomienda no exceder más del margen</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  bloque: {
    marginTop: Spacing.four,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.two,
  },
  etiqueta: {
    fontFamily: Fonts.light,
    fontSize: 19,
    color: Colors.text,
  },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Negro, como el documento; el gris de antes se veía "plomo".
    backgroundColor: '#000000',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  boton: {
    width: 44,
    alignItems: 'center',
  },
  signo: {
    fontFamily: Fonts.light,
    fontSize: 24,
    lineHeight: 28,
    color: Colors.text,
  },
  signoApagado: {
    color: Colors.textMuted,
    opacity: 0.4,
  },
  aviso: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.accent,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  valor: {
    fontFamily: Fonts.medium,
    fontSize: 19,
    color: Colors.text,
  },
});
