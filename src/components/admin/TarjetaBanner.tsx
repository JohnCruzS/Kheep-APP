import { Image } from 'expo-image';
import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Texto';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import type { BannerEnRevision } from '@/lib/catalog';
import { FORMATO_RECORTE, REJILLA, u } from '@/lib/rejilla';

/**
 * Un banner por revisar: la imagen tal como se verá en el carrusel. Dos
 * toques en ella lo aprueban (pedido del cliente). Con `conDatos`, debajo va
 * de quién es, dónde se muestra y por cuántos días (en el Aprobar general,
 * donde se mezclan banners de todos).
 */
export function TarjetaBanner({
  banner,
  onDobleToque,
  conDatos,
}: {
  banner: BannerEnRevision;
  onDobleToque: () => void;
  conDatos?: boolean;
}) {
  const ultimoToque = useRef(0);
  return (
    <View>
      <Pressable
        onPressIn={() => {
          const ahora = Date.now();
          if (ahora - ultimoToque.current < 500) {
            ultimoToque.current = 0;
            onDobleToque();
          } else {
            ultimoToque.current = ahora;
          }
        }}>
        <Image source={{ uri: banner.imagen_url }} style={styles.imagen} contentFit="cover" />
      </Pressable>
      {conDatos && (
        <>
          <Text style={styles.autor} numberOfLines={1}>
            {banner.autor?.nombre ?? 'Comerciante'}
          </Text>
          <Text style={styles.dato} numberOfLines={1}>
            {(banner.comuna?.nombre ?? 'Todas las comunas') + (banner.dias ? ` · ${banner.dias} días` : '')}
          </Text>
          {banner.enlace ? (
            <Text style={styles.dato} numberOfLines={1}>
              {banner.enlace}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  imagen: {
    width: '100%',
    aspectRatio: FORMATO_RECORTE.banner[0] / FORMATO_RECORTE.banner[1],
    borderRadius: u(REJILLA.curvatura),
    backgroundColor: Colors.surface,
  },
  autor: {
    fontFamily: Fonts.medium,
    fontSize: 18,
    color: Colors.text,
    marginTop: Spacing.three,
  },
  dato: {
    fontFamily: Fonts.delgada,
    fontSize: 15,
    color: Colors.textMuted,
    marginTop: Spacing.one,
  },
});
