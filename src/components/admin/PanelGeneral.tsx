import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Texto';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EncabezadoMarca } from '@/components/ui/EncabezadoMarca';
import { Colors, Fonts, Spacing, TarjetaLista } from '@/constants/theme';
import { puede } from '@/lib/administradores';
import { useSession } from '@/providers/SessionProvider';
import { fetchBannersPendientes, fetchPublicacionesPendientes } from '@/lib/catalog';
import { precargarBanners, precargarTitulo } from '@/lib/cacheAdmin';
import { fijarAltoTarjeta } from '@/lib/altoTarjeta';
import { REJILLA, u } from '@/lib/rejilla';
import { supabase } from '@/lib/supabase';

/**
 * La pestaña de administración general: lo que no depende de una comuna
 * concreta — el título de la app, aprobar publicaciones, los banners y las
 * métricas. Lo que sí depende de la comuna (categorías y perfiles) vive en la
 * pestaña de Comunas.
 *
 * Es una lista de tarjetas negras con borde tenue y el nombre en blanco, sin
 * iconos ni descripciones: los nombres son cortos y bastan para saber a dónde
 * lleva cada una. Al final, "Salir" en rojo y sin tarjeta, porque no es un
 * destino sino una acción. Medidas tomadas de la maqueta del cliente.
 */
export function PanelGeneral() {
  const router = useRouter();
  const { permisos } = useSession();
  // El general ve todo. El de zona, solo las secciones de sus permisos.
  const esGeneral = permisos?.esGeneral ?? false;
  const [pendientes, setPendientes] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let activo = true;
      // En segundo plano: cuando se toque "Título" o "Banners", sus datos ya
      // van a estar y la pantalla aparece completa, sin ruedita de carga.
      if (esGeneral) void precargarTitulo().catch(() => {});
      void precargarBanners().catch(() => {});
      // Publicaciones y banners esperando revisión.
      Promise.all([fetchPublicacionesPendientes(), fetchBannersPendientes().catch(() => [])])
        .then(([lista, banners]) => activo && setPendientes(lista.length + banners.length))
        .catch(() => activo && setPendientes(null));
      return () => {
        activo = false;
      };
    }, [esGeneral]),
  );

  function confirmarCierre() {
    Alert.alert('Cerrar sesión', '¿Quieres salir de la cuenta de administrador?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/(app)/(tabs)/dashboard');
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <EncabezadoMarca subtitulo="Chile" />

      {/* Sin desplazamiento: las tarjetas se achican lo justo para que todo,
          también "Salir", quepa en cualquier pantalla (pedido del cliente). */}
      <View style={styles.content}>
        <View style={styles.opciones}>
        {esGeneral && <Opcion label="Título" onPress={() => router.push('/(app)/admin/logos')} />}
        {puede(permisos, 'moderar') && (
        <Opcion
          label="Aprobar"
          // Las pendientes son lo único que "se acumula": el número evita
          // tener que entrar a comprobar si hay algo esperando.
          insignia={pendientes && pendientes > 0 ? pendientes : undefined}
          onPress={() => router.push('/(app)/admin/moderacion')}
        />
        )}
        {puede(permisos, 'banners') && (
          <Opcion label="Banners" onPress={() => router.push('/(app)/admin/banners')} />
        )}

        {/* "Datos" (maqueta del cliente): entra al Informe (las métricas) y,
            con dos toques en el logo, el general pasa al espacio usado y las
            copias de seguridad. */}
        {(esGeneral || puede(permisos, 'banners')) && (
          <Opcion label="Datos" onPress={() => router.push('/(app)/admin/metricas')} />
        )}

        {/* "Admin": los administradores y la cuenta propia ("Administración",
            con su correo y su contraseña). Por eso el general ya no tiene
            "Cuenta" aparte (maqueta del cliente). */}
        {esGeneral && <Opcion label="Admin" onPress={() => router.push('/(app)/admin/administradores')} />}

        {/* El de zona no entra a "Admin": su cuenta sigue teniendo su lugar. */}
        {!esGeneral && <Opcion label="Cuenta" onPress={() => router.push('/(app)/perfil/cuenta')} />}
        </View>

        {/* A la vista, no escondido dentro de "Cuenta": el admin comparte
            teléfono o entra desde otro y tiene que poder salir sin buscar. */}
        <Pressable style={styles.salir} onPress={confirmarCierre} accessibilityRole="button">
          <Text style={styles.salirLabel}>Salir</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/** Alto fijo de la fila de "Salir": así se puede calcular el de las tarjetas. */
const ALTO_SALIR = 58;
/** Tarjetas del panel del admin general. */
const TARJETAS_PANEL = 5;

/**
 * El alto que toma cada tarjeta del panel cuando el espacio entre el
 * encabezado y la barra de abajo mide `altoDisponible`: el de la maqueta como
 * mucho, o menos en una pantalla baja para que quepa "Salir". Lo usan también
 * las regiones de Comunas, para verse iguales (pedido del cliente).
 */
export function altoTarjetaPanel(altoDisponible: number): number {
  const opciones = altoDisponible - Spacing.two - ALTO_SALIR;
  const alto = opciones / TARJETAS_PANEL - u(REJILLA.margenLateral);
  return Math.floor(Math.max(48, Math.min(u(240), alto)));
}

function Opcion({
  label,
  insignia,
  onPress,
}: {
  label: string;
  insignia?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.tarjeta, pressed && styles.tarjetaPresionada]}
      onPress={onPress}
      // Su alto es el de todas las tarjetas de la app (Comunas, Informe…).
      onLayout={(e) => fijarAltoTarjeta(e.nativeEvent.layout.height)}>
      <Text style={styles.label}>{label}</Text>
      {insignia !== undefined && (
        <View style={styles.insignia}>
          <Text style={styles.insigniaLabel}>{insignia}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingBottom: Spacing.two,
  },
  opciones: {
    flex: 1,
  },
  // Maqueta del cliente: tarjeta negra con borde tenue, de un 21 % del ancho
  // de la pantalla de alto, y el nombre a un 11,6 % del borde.
  tarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    // Igual que las tarjetas de las regiones (pedido del cliente): mismo
    // alto, misma sangría y mismo texto.
    backgroundColor: TarjetaLista.fondo,
    borderRadius: u(REJILLA.curvatura),
    borderWidth: 1,
    borderColor: TarjetaLista.borde,
    paddingHorizontal: TarjetaLista.sangria,
    // Maqueta del cliente: cada tarjeta mide 240 de 1000 del ancho, igual que
    // las de Admin, y entre una y otra va un margen lateral.
    // Como mucho el alto de la maqueta; en una pantalla baja se achican
    // todas por igual para que quepa "Salir".
    flex: 1,
    maxHeight: u(240),
    minHeight: 48,
    marginBottom: u(REJILLA.margenLateral),
  },
  tarjetaPresionada: {
    backgroundColor: Colors.backgroundAlt,
  },
  label: {
    fontFamily: Fonts.tarjeta,
    flex: 1,
    fontSize: TarjetaLista.tamanoTexto,
    lineHeight: TarjetaLista.altoLinea,
    color: Colors.text,
  },
  salir: {
    alignItems: 'center',
    justifyContent: 'center',
    height: ALTO_SALIR,
  },
  // Poppins Light en rojo (maqueta del cliente), igual que "Nuevo" en Admin.
  salirLabel: {
    fontFamily: Fonts.delgada,
    fontSize: 25,
    color: Colors.accent,
  },
  insignia: {
    backgroundColor: Colors.accent,
    borderRadius: 20,
    minWidth: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  insigniaLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 12.5,
    color: '#FFFFFF',
  },
});
