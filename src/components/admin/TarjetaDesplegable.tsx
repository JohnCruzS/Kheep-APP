import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Interruptor } from '@/components/ui/Interruptor';
import type { PropsMantener } from '@/components/ui/ListaArrastrable';
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
  mantener,
  onMantenerTitulo,
  pistaMantener,
  alFinal,
  alto,
  separacion,
  children,
}: {
  /** Alto fijo de la tarjeta cerrada, en píxeles (Admin: 240 de 1000 del ancho). */
  alto?: number;
  /** Espacio debajo de la tarjeta, en píxeles (si no, el de siempre). */
  separacion?: number;
  /**
   * Mantener apretado el NOMBRE (no el resto de la caja) hace esto —en
   * Admins, cambiar el nombre—. El resto de la caja sigue sirviendo para
   * agarrarla y moverla.
   */
  onMantenerTitulo?: () => void;
  /** Qué hace mantener presionado el nombre (para el lector de pantalla). */
  pistaMantener?: string;
  titulo: string;
  /** Mantener apretado el nombre agarra la tarjeta para moverla (ver Admins). */
  mantener?: PropsMantener;
  /** Lo que va pegado al nombre, por ejemplo el "(5)" de publicaciones. */
  junto?: ReactNode;
  abierta: boolean;
  onAlternar: () => void;
  /** A la derecha del nombre, solo con la tarjeta abierta (el interruptor). */
  derecha?: ReactNode;
  /** Contra el borde derecho, abierta o cerrada (el número de una lista simple). */
  alFinal?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <View style={[styles.tarjeta, separacion !== undefined && { marginBottom: separacion }]}>
      {/* Toda la franja de arriba de la caja, de borde a borde, es el área
          para abrir o cerrar la tarjeta, y para agarrarla manteniéndola
          apretada: no solo el nombre. Lo que va adentro con su propio toque
          (el "(5)", el interruptor) sigue respondiendo a lo suyo. */}
      <Pressable
        // Con alto fijo, la franja mide eso (menos el borde) y el nombre va
        // centrado en ella, en vez de depender del aire de arriba y abajo.
        style={[styles.cabecera, alto !== undefined && { height: alto - 2, paddingVertical: 0 }]}
        onPress={onAlternar}
        onLongPress={mantener?.onLongPress}
        onPressOut={mantener?.onPressOut}
        delayLongPress={300}
        accessibilityRole="button"
        accessibilityLabel={titulo}>
        {onMantenerTitulo ? (
          <Pressable
            style={styles.zonaTitulo}
            onPress={onAlternar}
            onLongPress={onMantenerTitulo}
            delayLongPress={400}
            hitSlop={4}
            accessibilityHint={pistaMantener ?? 'Mantén apretado para cambiar el nombre'}>
            <Text style={styles.titulo} numberOfLines={1}>
              {titulo}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.zonaTitulo}>
            <Text style={styles.titulo} numberOfLines={1}>
              {titulo}
            </Text>
          </View>
        )}
        {junto}
        {/* Empuja lo de la derecha (el interruptor) contra el borde. */}
        <View style={styles.espacio} />
        {abierta && derecha}
        {alFinal}
      </Pressable>
      {abierta && <View style={styles.cuerpo}>{children}</View>}
    </View>
  );
}

/** "Correo  admin@kheep.cl": la etiqueta en rojo y el dato en blanco. */
export function FilaDato({ etiqueta, valor, onPress }: { etiqueta: string; valor: string; onPress?: () => void }) {
  return (
    <View style={styles.filaDato}>
      <Pressable onPress={onPress} disabled={!onPress} hitSlop={6}>
        <Text style={styles.etiqueta}>{etiqueta}</Text>
      </Pressable>
      <ValorDeslizable texto={valor} onPress={onPress} />
    </View>
  );
}

/**
 * Cómo contactar a un perfil, en una sola fila (pedido del cliente): parte
 * en "WhatsApp" con su número; tocar la palabra la cambia a "Correo" y al
 * revés. Tocar el dato abre WhatsApp o el correo para escribirle.
 */
export function FilaContacto({
  whatsapp,
  correo,
  onWhatsApp,
  onCorreo,
}: {
  whatsapp: string | null;
  correo: string | null | undefined;
  onWhatsApp: () => void;
  onCorreo: () => void;
}) {
  const [verCorreo, setVerCorreo] = useState(false);
  const valor = verCorreo
    ? correo === undefined
      ? 'cargando…'
      : (correo ?? 'sin correo')
    : (whatsapp ?? 'sin WhatsApp');
  const puede = verCorreo ? Boolean(correo) : Boolean(whatsapp);
  return (
    <View style={styles.filaDato}>
      <Pressable onPress={() => setVerCorreo((v) => !v)} hitSlop={8} accessibilityRole="button">
        <Text style={styles.etiqueta}>{verCorreo ? 'Correo' : 'WhatsApp'}</Text>
      </Pressable>
      <ValorDeslizable
        texto={valor}
        onPress={puede ? (verCorreo ? onCorreo : onWhatsApp) : undefined}
        etiquetaAccesible={verCorreo ? 'Escribir un correo' : 'Escribir por WhatsApp'}
      />
    </View>
  );
}

/**
 * Correo y contraseña de una cuenta en una sola fila (pedido del cliente):
 * tocar la palabra "Correo" la cambia a "Contraseña  XXXXXXXX" y al revés.
 * Tocar el correo abre la ventana para cambiarlo; tocar las X, la de cambiar
 * la contraseña (nunca se muestra: se guarda cifrada).
 */
export function FilaCredenciales({
  correo,
  onCambiarCorreo,
  onCambiarClave,
}: {
  correo: string;
  onCambiarCorreo: () => void;
  onCambiarClave: () => void;
}) {
  const [verClave, setVerClave] = useState(false);
  return (
    <View style={styles.filaDato}>
      <Pressable onPress={() => setVerClave((v) => !v)} hitSlop={8} accessibilityRole="button">
        <Text style={styles.etiqueta}>{verClave ? 'Contraseña' : 'Correo'}</Text>
      </Pressable>
      <ValorDeslizable
        texto={verClave ? 'XXXXXXXX' : correo}
        onPress={verClave ? onCambiarClave : onCambiarCorreo}
        etiquetaAccesible={verClave ? 'Cambiar contraseña' : 'Cambiar correo'}
      />
    </View>
  );
}

/**
 * El dato de una fila (un correo, por ejemplo) con el mismo tamaño de letra
 * que la etiqueta (pedido del cliente): si no cabe, en vez de achicarse se
 * desliza de lado ahí mismo para ver el resto. Tocarlo hace `onPress`.
 */
function ValorDeslizable({ texto, onPress, etiquetaAccesible }: { texto: string; onPress?: () => void; etiquetaAccesible?: string }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.valorTocable}
      contentContainerStyle={styles.valorContenido}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        hitSlop={8}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={etiquetaAccesible}>
        <Text style={styles.valor} numberOfLines={1}>
          {texto}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

/** Un permiso con su interruptor ("Aprobación", "Directo"...). */
export function FilaInterruptor({
  etiqueta,
  valor,
  onCambio,
  deshabilitado,
  incluye,
}: {
  etiqueta: string;
  valor: boolean;
  onCambio: (valor: boolean) => void;
  deshabilitado?: boolean;
  /** Lo que abarca, listado en gris debajo ("· Aprobar publicaciones"). */
  incluye?: string[];
}) {
  return (
    <View style={styles.fila}>
      <View style={styles.filaTexto}>
        <Text style={[styles.permiso, deshabilitado && styles.apagado]}>{etiqueta}</Text>
        {incluye?.map((cosa) => (
          <Text key={cosa} style={styles.incluye}>
            · {cosa}
          </Text>
        ))}
      </View>
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
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: TarjetaLista.aireVertical,
    paddingHorizontal: TarjetaLista.sangria,
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
    paddingHorizontal: TarjetaLista.sangria,
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
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.text,
  },
  filaTexto: {
    flex: 1,
  },
  incluye: {
    fontFamily: Fonts.delgada,
    fontSize: 14,
    lineHeight: 19,
    color: Colors.textMuted,
  },
  permiso: {
    fontFamily: Fonts.delgada,
    fontSize: 22,
    color: Colors.text,
  },
  valorTocable: {
    flex: 1,
  },
  valorContenido: {
    alignItems: 'center',
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
