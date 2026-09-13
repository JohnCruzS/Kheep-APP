import { Image } from 'expo-image';
import { memo, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Layout } from '@/constants/theme';
import type { Banner } from '@/lib/catalog';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
/**
 * Ancho estimado, solo para el primer dibujado. El de verdad se mide del
 * contenedor real (ver `medirAncho`): calcularlo con `Dimensions` y márgenes
 * redondeados deja un desfase de una fracción de píxel contra el ancho que
 * termina teniendo el carrusel, y ese desfase se acumula banner a banner
 * hasta que asoma una franja del siguiente por el borde.
 */
const BANNER_WIDTH_ESTIMADO = SCREEN_WIDTH - Layout.catalogMargin * 2;
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
  // Ancho real del carrusel, medido del contenedor. Todo —el tamaño de cada
  // banner, el avance automático y el salto del ciclo— usa este número, así
  // que siempre calzan entre sí en cualquier pantalla.
  const [ancho, setAncho] = useState(BANNER_WIDTH_ESTIMADO);
  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);

  const total = banners.length;
  const enCiclo = total > 1;
  const slides = enCiclo ? [...banners, banners[0]] : banners;

  useEffect(() => {
    if (!enCiclo || arrastrando) return;
    const id = setInterval(() => {
      scrollRef.current?.scrollTo({ x: (indexRef.current + 1) * ancho, animated: true });
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [enCiclo, arrastrando, ancho]);

  if (total === 0) return null;

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;

    // Llegó a la copia del primero: salto invisible al primero real.
    if (enCiclo && x >= total * ancho - 1) {
      scrollRef.current?.scrollTo({ x: 0, animated: false });
      indexRef.current = 0;
      return;
    }

    // La posición vive en una ref, no en el estado: se actualiza en cada
    // cuadro del desplazamiento y guardarla en el estado redibujaría el
    // carrusel entero decenas de veces por segundo sin que cambie nada.
    indexRef.current = Math.round(x / ancho);
  };

  function medirAncho(e: LayoutChangeEvent) {
    const medido = Math.round(e.nativeEvent.layout.width);
    if (medido > 0 && medido !== ancho) {
      setAncho(medido);
      // El carrusel puede estar parado en una posición calculada con el
      // ancho viejo (al girar el teléfono, por ejemplo): se vuelve al primer
      // banner para no quedar a mitad de camino entre dos.
      indexRef.current = 0;
      scrollRef.current?.scrollTo({ x: 0, animated: false });
    }
  }

  return (
    // `overflow: hidden` es la red de seguridad: aunque una imagen viniera
    // con un tamaño raro, nada puede dibujarse fuera del carrusel.
    <View style={styles.wrapper} onLayout={medirAncho}>
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
            style={[styles.slide, { width: ancho }]}
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
    overflow: 'hidden',
    borderRadius: 11,
  },
  slide: {
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
