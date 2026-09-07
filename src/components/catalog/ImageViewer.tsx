import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Props = {
  images: string[];
  visible: boolean;
  initialIndex: number;
  onClose: () => void;
};

/**
 * "Visualizador de imágenes en pantalla completa" del plan (ficha de
 * detalle): logo + fotos de producto se ven en miniatura en la pantalla,
 * pero cualquiera se puede tocar para verla grande, con deslizamiento entre
 * todas las fotos de esa publicación.
 */
export function ImageViewer({ images, visible, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const scrollRef = useRef<ScrollView>(null);

  if (images.length === 0) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: initialIndex * SCREEN_WIDTH, y: 0 }}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))}>
          {images.map((uri, i) => (
            <View key={`${uri}-${i}`} style={styles.slide}>
              <Image source={{ uri }} style={styles.image} contentFit="contain" />
            </View>
          ))}
        </ScrollView>

        <SafeAreaView style={styles.topBar} edges={['top']}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
            <Text style={styles.closeLabel}>✕</Text>
          </Pressable>
          {images.length > 1 && (
            <Text style={styles.counter}>
              {index + 1} / {images.length}
            </Text>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000000',
  },
  slide: {
    width: SCREEN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLabel: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  counter: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
});
