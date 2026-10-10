import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Interruptor } from '@/components/ui/Interruptor';
import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing, TarjetaLista } from '@/constants/theme';
import { REJILLA, u } from '@/lib/rejilla';

/**
 * Tarjeta del panel que se abre y se cierra, como las maquetas del cliente
 * para Admins y para los usuarios de una categoría: cerrada muestra solo el
 * nombre; abierta, además, su interruptor y todo lo de adentro.
 *
 * Mismo fondo, borde, sangría y letra que las tarjetas de las regiones
 * (TarjetaLista), para que todo el panel se vea igual.
 */
export function TarjetaDesplegable({
  titulo,
  junto,
  abierta,
  onAlternar,
  derecha,
  children,
}: {
  titulo: string;
  /** Lo que va pegado al nombre, por ejemplo el "(5)" de publicaciones. */
  junto?: ReactNode;
  abierta: boolean;
  onAlternar: () => void;
  /** A la derecha del nombre, solo con la tarjeta abierta (el interruptor). */
  derecha?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <View style={styles.tarjeta}>
      <View style={styles.cabecera}>
        <Pressable style={styles.zonaTitulo} onPress={onAlternar} accessibilityRole="button" hitSlop={6}>
          <Text style={styles.titulo} numberOfLines={1}>
            {titulo}
          </Text>
        </Pressable>
        {junto}
        {/* Empuja lo de la derecha (el interruptor) contra el borde. */}
        <View style={styles.espacio} />
        {abierta && derecha}
      </View>
      {abierta && <View style={styles.cuerpo}>{children}</View>}
    </View>
  );
}

/** "Correo  admin@kheep.cl": la etiqueta en rojo y el dato en blanco. */
export function FilaDato({ etiqueta, valor, onPress }: { etiqueta: string; valor: string; onPress?: () => void }) {
  return (
    <Pressable
      style={styles.filaDato}
      onPress={onPress}
      disabled={!onPress}
      hitSlop={6}
      accessibilityRole={onPress ? 'button' : undefined}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <Text style={styles.valor} numberOfLines={1} adjustsFontSizeToFit>
        {valor}
      </Text>
    </Pressable>
  );
}

/** Un permiso con su interruptor ("Aprobación", "Directo"...). */
export function FilaInterruptor({
  etiqueta,
  valor,
  onCambio,
  deshabilitado,
}: {
  etiqueta: string;
  valor: boolean;
  onCambio: (valor: boolean) => void;
  deshabilitado?: boolean;
}) {
  return (
    <View style={styles.fila}>
      <Text style={[styles.permiso, deshabilitado && styles.apagado]}>{etiqueta}</Text>
      <Interruptor value={valor} onValueChange={onCambio} disabled={deshabilitado} accessibilityLabel={etiqueta} />
    </View>
  );
}

/** Una acción en texto rojo centrado ("Quitar", "Eliminar", "Cambiar clave"). */
export function AccionRoja({ texto, onPress }: { texto: string; onPress: () => void }) {
  return (
    <Pressable style={styles.accion} onPress={onPress} hitSlop={8} accessibilityRole="button">
      <Text style={styles.accionTexto}>{texto}</Text>
    </Pressable>
  );
}

/** Un texto rojo centrado que no es botón, como "zona – Santiago". */
export function NotaRoja({ texto, onPress }: { texto: string; onPress?: () => void }) {
  return (
    <Pressable style={styles.nota} onPress={onPress} disabled={!onPress} hitSlop={6}>
      <Text style={styles.notaTexto}>{texto}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    backgroundColor: TarjetaLista.fondo,
    borderRadius: u(REJILLA.curvatura),
    borderWidth: 1,
    borderColor: TarjetaLista.borde,
    marginBottom: TarjetaLista.separacion * 2,
    paddingHorizontal: TarjetaLista.sangria,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: TarjetaLista.aireVertical,
  },
  zonaTitulo: {
    flexShrink: 1,
  },
  espacio: {
    flex: 1,
  },
  titulo: {
    fontFamily: Fonts.tarjeta,
    fontSize: TarjetaLista.tamanoTexto,
    lineHeight: TarjetaLista.altoLinea,
    color: Colors.text,
  },
  cuerpo: {
    paddingBottom: TarjetaLista.aireVertical,
    gap: Spacing.three,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  // "Correo  admin@kheep.cl": el dato va pegado a la etiqueta, como la maqueta.
  filaDato: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  etiqueta: {
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.accent,
  },
  valor: {
    flex: 1,
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.text,
  },
  permiso: {
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.text,
  },
  apagado: {
    color: Colors.textMuted,
  },
  accion: {
    alignItems: 'center',
    paddingTop: Spacing.two,
  },
  accionTexto: {
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.accent,
  },
  nota: {
    alignItems: 'center',
  },
  notaTexto: {
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.accent,
    textAlign: 'center',
  },
});
