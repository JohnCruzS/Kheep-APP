import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing, TarjetaLista } from '@/constants/theme';
import { EspacioUsado as Espacio, LIMITES_PLAN, fetchEspacioUsado } from '@/lib/catalog';
import { getErrorMessage } from '@/lib/errors';
import { REJILLA, u } from '@/lib/rejilla';

const NOMBRE_CARPETA: Record<string, string> = {
  productos: 'Fotos de productos',
  logos: 'Logos',
  banners: 'Banners',
};

/** "14,2 MB", "830 KB", "1,0 GB". */
function peso(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toLocaleString('es-CL', { maximumFractionDigits: 1 })} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toLocaleString('es-CL', { maximumFractionDigits: 1 })} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/** La barra de la app: rojo lo usado sobre blanco lo que queda. */
function Barra({ fraccion }: { fraccion: number }) {
  const f = Math.max(0, Math.min(1, fraccion));
  return (
    <View style={styles.barra}>
      {/* Siempre se ve un poquito de rojo: con 1 % la barra parecía vacía. */}
      <View style={[styles.barraLlena, { flex: Math.max(f, 0.01) }]} />
      {f < 1 && <View style={{ flex: 1 - Math.max(f, 0.01) }} />}
    </View>
  );
}

/**
 * Cuánto espacio se usa y cuánto queda (pedido del cliente; 0047), en
 * Panel → Datos: una tarjeta para la base de datos y otra para los archivos,
 * con el porcentaje en rojo y la barra de siempre (rojo lo usado, blanco lo
 * libre). Los archivos se reparten por carpeta.
 */
export function EspacioUsado() {
  const [espacio, setEspacio] = useState<Espacio | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setEspacio(await fetchEspacioUsado());
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo leer el espacio usado.'));
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!espacio) return <ActivityIndicator color={Colors.accent} style={styles.cargando} />;

  const totalArchivos = Object.values(espacio.archivos).reduce((s, b) => s + b, 0);
  const carpetas = Object.entries(espacio.archivos).sort((a, b) => b[1] - a[1]);

  return (
    <View>
      <Tarjeta titulo="Base de datos" usado={espacio.baseDeDatos} limite={LIMITES_PLAN.baseDeDatos} />
      <Tarjeta titulo="Archivos" usado={totalArchivos} limite={LIMITES_PLAN.archivos}>
        {carpetas.map(([carpeta, bytes]) => (
          <View key={carpeta} style={styles.carpeta}>
            <View style={styles.filaCarpeta}>
              <Text style={styles.nombreCarpeta}>{NOMBRE_CARPETA[carpeta] ?? carpeta}</Text>
              <Text style={styles.pesoCarpeta}>{peso(bytes)}</Text>
            </View>
            {/* Cuánto de los archivos es de esta carpeta. */}
            <Barra fraccion={totalArchivos > 0 ? bytes / totalArchivos : 0} />
          </View>
        ))}
      </Tarjeta>
    </View>
  );
}

function Tarjeta({
  titulo,
  usado,
  limite,
  children,
}: {
  titulo: string;
  usado: number;
  limite: number;
  children?: React.ReactNode;
}) {
  const fraccion = usado / limite;
  const porcentaje = fraccion > 0 && fraccion < 0.01 ? '<1' : String(Math.round(fraccion * 100));
  return (
    <View style={styles.tarjeta}>
      <View style={styles.cabecera}>
        <Text style={styles.titulo}>{titulo}</Text>
        <Text style={styles.porcentaje}>{porcentaje} %</Text>
      </View>
      <Barra fraccion={fraccion} />
      <View style={styles.pie}>
        <Text style={styles.detalle}>{peso(usado)} usados</Text>
        <Text style={styles.detalle}>Quedan {peso(Math.max(0, limite - usado))}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    backgroundColor: TarjetaLista.fondo,
    borderRadius: u(REJILLA.curvatura),
    borderWidth: 1,
    borderColor: TarjetaLista.borde,
    marginBottom: u(REJILLA.margenLateral),
    paddingHorizontal: TarjetaLista.sangria,
    paddingVertical: Spacing.four,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  titulo: {
    fontFamily: Fonts.tarjeta,
    fontSize: TarjetaLista.tamanoTexto,
    color: Colors.text,
  },
  porcentaje: {
    fontFamily: Fonts.delgada,
    fontSize: TarjetaLista.tamanoTexto,
    color: Colors.accent,
  },
  barra: {
    flexDirection: 'row',
    height: 3,
    backgroundColor: '#FFFFFF',
  },
  barraLlena: {
    backgroundColor: Colors.accent,
  },
  pie: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  detalle: {
    fontFamily: Fonts.delgada,
    fontSize: 16,
    color: Colors.textMuted,
  },
  carpeta: {
    marginTop: Spacing.four,
  },
  filaCarpeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  nombreCarpeta: {
    fontFamily: Fonts.delgada,
    fontSize: 19,
    color: Colors.text,
  },
  pesoCarpeta: {
    fontFamily: Fonts.delgada,
    fontSize: 19,
    color: Colors.accent,
  },
  error: {
    fontFamily: Fonts.light,
    fontSize: 14,
    color: Colors.danger,
    marginBottom: Spacing.three,
  },
  cargando: {
    marginVertical: Spacing.four,
  },
});
