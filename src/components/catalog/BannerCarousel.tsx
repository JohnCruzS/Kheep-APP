import { Image } from 'expo-image';
import { memo, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  LayoutChangeEvent,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Layout } from '@/constants/theme';
import { registrarClicBanner, registrarVistaBanner } from '@/lib/catalog';
import type { Banner } from '@/lib/catalog';
import { REJILLA, u } from '@/lib/rejilla';

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
  /**
   * Banners ya contados en esta sesión. La vista se cuenta la primera vez que
   * el banner aparece, no cada vez que el carrusel vuelve a pasar por él: si
   * no, tener la app abierta unos minutos valdría decenas de "vistas" y el
   * número no significaría nada para quien lo paga.
   */
  const vistos = useRef<Set<string>>(new Set());
  // Ancho real del carrusel, medido del contenedor. Todo —el tamaño de cada
  // banner, el avance automático y el salto del ciclo— usa este número, así
  // que siempre calzan entre sí en cualquier pantalla.
  const [ancho, setAncho] = useState(BANNER_WIDTH_ESTIMADO);
  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);

  /** Cuenta la vista de un banner, una sola vez por sesión. */
  const contarVista = (banner: Banner) => {
    if (vistos.current.has(banner.id)) return;
    vistos.current.add(banner.id);
    registrarVistaBanner(banner.id).catch(() => {
      // Una métrica perdida no vale interrumpir el catálogo.
    });
  };

  async function abrirEnlace(banner: Banner) {
    if (!banner.enlace) return;
    registrarClicBanner(banner.id).catch(() => {});
    if (await Linking.canOpenURL(banner.enlace)) await Linking.openURL(banner.enlace);
  }

  const total = banners.length;
  const enCiclo = total > 1;
  const slides = enCiclo ? [...banners, banners[0]] : banners;

  // El primero se cuenta apenas se dibuja el carrusel; los demás, al llegar
  // a ellos (ver onScroll).
  useEffect(() => {
    if (banners.length > 0) contarVista(banners[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banners]);

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
    const visible = banners[indexRef.current];
    if (visible) contarVista(visible);
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
            {/* Tocar el banner lleva a su enlace (documento EDIT APP). Sin
                enlace no hace nada: no hay a dónde ir. */}
            <Pressable
              style={styles.image}
              onPress={() => abrirEnlace(banner)}
              disabled={!banner.enlace}
              accessibilityRole={banner.enlace ? 'link' : 'image'}>
              <Image source={{ uri: banner.imagen_url }} style={styles.image} contentFit="cover" transition={150} />
            </Pressable>
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
    borderRadius: u(REJILLA.curvatura),
  },
  slide: {
    height: u(REJILLA.bannerAlto),
    borderRadius: u(REJILLA.curvatura),
    overflow: 'hidden',
    backgroundColor: '#17171A',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
