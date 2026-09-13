import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { ComponentProps, useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/ui/BrandLogo';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { fetchPublicacionesPendientes } from '@/lib/catalog';
import { useSession } from '@/providers/SessionProvider';

type NombreIcono = ComponentProps<typeof Ionicons>['name'];

/**
 * Panel de Administración: vitrina (comunas/categorías/marca), moderación de
 * publicaciones y métricas de WhatsApp.
 *
 * Los iconos son de trazo y de un solo color, no emojis: los emojis los
 * dibuja cada teléfono con su propia paleta —se ven distintos en cada marca,
 * a veces a todo color— y en un panel de trabajo eso se lee como desorden.
 */
export default function AdminScreen() {
  const { profile } = useSession();
  const router = useRouter();
  const [pendientes, setPendientes] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let activo = true;
      fetchPublicacionesPendientes()
        .then((lista) => activo && setPendientes(lista.length))
        .catch(() => activo && setPendientes(null));
      return () => {
        activo = false;
      };
    }, []),
  );

  if (profile && profile.rol !== 'admin') {
    return <Redirect href="/(app)/(tabs)/dashboard" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <BrandLogo height={29} />
        <Text style={styles.eyebrow}>Panel de administración</Text>
      </View>

      {/* Desplazable: la lista crece con cada sección nueva y en pantallas
          más bajas las últimas quedaban fuera, sin forma de llegar a ellas.
          El relleno de abajo deja el espacio de la barra de pestañas, así la
          última fila nunca queda debajo de ella. */}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>MODERACIÓN</Text>
        <AdminRow
          icon="shield-checkmark-outline"
          label="Publicaciones pendientes"
          descripcion="Aprobar o rechazar lo que publican los comercios"
          badge={pendientes && pendientes > 0 ? pendientes : undefined}
          onPress={() => router.push('/(app)/admin/moderacion')}
        />
        <AdminRow
          icon="stats-chart-outline"
          label="Métricas de WhatsApp"
          descripcion="Cuántos contactos recibe cada publicación"
          onPress={() => router.push('/(app)/admin/metricas')}
        />

        <Text style={[styles.sectionLabel, styles.sectionLabelSeparada]}>VITRINA</Text>
        <AdminRow
          icon="location-outline"
          label="Comunas"
          descripcion="Qué comunas se ven y el catálogo de cada una"
          onPress={() => router.push('/(app)/admin/comunas')}
        />
        <AdminRow
          icon="pricetags-outline"
          label="Categorías"
          descripcion="Lista general, orden y visibilidad"
          onPress={() => router.push('/(app)/admin/categorias')}
        />
        <AdminRow
          icon="color-palette-outline"
          label="Título de la app"
          descripcion="Imagen, tamaño, posición y logos por fecha"
          onPress={() => router.push('/(app)/admin/logos')}
        />
        <Text style={[styles.sectionLabel, styles.sectionLabelSeparada]}>BANNERS</Text>
        <AdminRow
          icon="add-circle-outline"
          label="Publicar banner"
          descripcion="Subir un banner nuevo y elegir sus días"
          onPress={() => router.push('/(app)/banner/publicar')}
        />
        <AdminRow
          icon="images-outline"
          label="Banners activos"
          descripcion="Los que están rotando hoy en el catálogo"
          onPress={() => router.push('/(app)/admin/banners')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function AdminRow({
  icon,
  label,
  descripcion,
  badge,
  onPress,
}: {
  icon: NombreIcono;
  label: string;
  descripcion: string;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPresionada]} onPress={onPress}>
      <View style={styles.iconoCaja}>
        <Ionicons name={icon} size={19} color={Colors.text} />
      </View>

      <View style={styles.rowTexto}>
        <Text style={styles.rowLabel}>{label}</Text>
        {/* Una línea de qué hace cada sección: el panel creció y solo con el
            título no siempre se acierta a la primera dónde entrar. */}
        <Text style={styles.rowDescripcion} numberOfLines={1}>
          {descripcion}
        </Text>
      </View>

      {badge !== undefined && (
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
  },
  eyebrow: {
    fontFamily: Fonts.light,
    marginTop: 2,
    fontSize: 13,
    color: Colors.textMuted,
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.six,
  },
  sectionLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: Colors.textMuted,
    marginBottom: Spacing.two,
  },
  sectionLabelSeparada: {
    marginTop: Spacing.five,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  rowPresionada: {
    backgroundColor: Colors.backgroundAlt,
  },
  iconoCaja: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  rowTexto: {
    flex: 1,
  },
  rowLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14.5,
    color: Colors.text,
  },
  rowDescripcion: {
    fontFamily: Fonts.light,
    fontSize: 11.5,
    color: Colors.textMuted,
    marginTop: 2,
  },
  badge: {
    backgroundColor: Colors.accent,
    borderRadius: 20,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 11.5,
    color: '#FFFFFF',
  },
});
