import { Image } from 'expo-image';
import { memo, useEffect, useRef, useState } from 'react';
import { Dimensions, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, View } from 'react-native';

import { Layout } from '@/constants/theme';
import type { Banner } from '@/lib/catalog';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BANNER_WIDTH = SCREEN_WIDTH - Layout.catalogMargin * 2;
/** Cada cuánto avanza solo el carrusel. */
const AUTOPLAY_MS = 3000;

/**
 * Carrusel de banners según la plantilla: la imagen llena directamente un
 * rectángulo de esquinas redondeadas, sin marco. Los puntitos van
 * superpuestos abajo de la imagen para no alterar el espacio hasta las
 * categorías.
 *
 * Avanza solo hacia la izquierda cada 3 segundos y, al llegar al último,
 * vuelve a empezar. Para que el reinicio no se vea como un "rebobinado" hacia
 * la derecha, al final se agrega una copia del primer banner: el carrusel se
 * desliza hacia esa copia (siempre hacia la izquierda) y, apenas llega, salta
 * sin animación al primero real, que se ve idéntico. Mientras el usuario lo
 * está arrastrando con el dedo, el avance automático se pausa.
 */
function BannerCarouselComponent({ banners }: { banners: Banner[] }) {
  const [arrastrando, setArrastrando] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);

  const total = banners.length;
  const enCiclo = total > 1;
  const slides = enCiclo ? [...banners, banners[0]] : banners;

  useEffect(() => {
    if (!enCiclo || arrastrando) return;
    const id = setInterval(() => {
      scrollRef.current?.scrollTo({ x: (indexRef.current + 1) * BANNER_WIDTH, animated: true });
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [enCiclo, arrastrando]);

  if (total === 0) return null;

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;

    // Llegó a la copia del primero: salto invisible al primero real.
    if (enCiclo && x >= total * BANNER_WIDTH - 1) {
      scrollRef.current?.scrollTo({ x: 0, animated: false });
      indexRef.current = 0;
      return;
    }

    // La posición vive en una ref, no en el estado: se actualiza en cada
    // cuadro del desplazamiento y guardarla en el estado redibujaría el
    // carrusel entero decenas de veces por segundo sin que cambie nada.
    indexRef.current = Math.round(x / BANNER_WIDTH);
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        onScrollBeginDrag={() => setArrastrando(true)}
        onScrollEndDrag={() => setArrastrando(false)}
        onMomentumScrollEnd={() => setArrastrando(false)}
        scrollEventThrottle={16}>
        {slides.map((banner, i) => (
          <View
            key={i < total ? banner.id : `${banner.id}-copia`}
            style={styles.slide}
            // La copia del primero (solo existe para el ciclo continuo) no se
            // anuncia: el lector de pantalla contaría un banner de más.
            accessible={i < total}
            accessibilityLabel={i < total ? `Banner ${i + 1} de ${total}` : undefined}
            importantForAccessibility={i < total ? 'yes' : 'no-hide-descendants'}>
            <Image source={{ uri: banner.imagen_url }} style={styles.image} contentFit="cover" transition={150} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export const BannerCarousel = memo(BannerCarouselComponent);

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 22,
  },
  slide: {
    width: BANNER_WIDTH,
    height: 170,
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: '#17171A',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
