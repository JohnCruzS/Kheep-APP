import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Colors, Fonts, Spacing } from '@/constants/theme';

export function LoadingState() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={Colors.accent} />
    </View>
  );
}

/**
 * `sobreClaro`: el aviso va sobre el gris claro del catálogo, donde el título
 * blanco de siempre no se leía.
 */
export function EmptyState({ title, message, sobreClaro }: { title: string; message: string; sobreClaro?: boolean }) {
  return (
    <View style={styles.center}>
      <Text style={[styles.title, sobreClaro && styles.titleSobreClaro]}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>No se pudo cargar</Text>
      <Text style={styles.message}>{message}</Text>
      <View style={styles.retryButton}>
        <Button label="Reintentar" variant="secondary" onPress={onRetry} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleSobreClaro: {
    color: '#1A1A1A',
  },
  center: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    color: Colors.text,
  },
  message: {
    fontFamily: Fonts.light,
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    maxWidth: 260,
  },
  retryButton: {
    width: 160,
  },
});
