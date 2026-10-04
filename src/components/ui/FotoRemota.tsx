import { Image, type ImageContentFit, type ImageStyle } from 'expo-image';
import { memo, useState } from 'react';
import type { StyleProp } from 'react-native';

import { urlAjustada, urlDifuminada } from '@/lib/fotos';

/**
 * Una foto guardada en Supabase, pedida al tamaño en que se muestra (ver
 * lib/fotos.ts) y con un difuminado de sí misma mientras carga, en vez del
 * recuadro gris.
 *
 * Si la versión achicada fallara (por ejemplo, si el proyecto dejara de
 * tener la transformación de imágenes), se pide la original: la foto nunca
 * se queda sin aparecer por esto.
 *
 * Con una foto que no es de Supabase (una recién elegida de la galería) se
 * comporta como una imagen común.
 */
function FotoRemotaComponent({
  uri,
  ancho,
  style,
  contentFit = 'cover',
  transicion = 150,
}: {
  uri: string;
  /** Ancho en pantalla, en puntos: decide qué tan grande se pide la foto. */
  ancho: number;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  transicion?: number;
}) {
  const [usarOriginal, setUsarOriginal] = useState(false);
  const fuente = usarOriginal ? uri : urlAjustada(uri, ancho);
  const difuminado = usarOriginal ? null : urlDifuminada(uri);

  return (
    <Image
      source={{ uri: fuente }}
      placeholder={difuminado ? { uri: difuminado } : undefined}
      placeholderContentFit={contentFit}
      style={style}
      contentFit={contentFit}
      transition={transicion}
      cachePolicy="memory-disk"
      recyclingKey={uri}
      onError={() => {
        if (!usarOriginal && fuente !== uri) setUsarOriginal(true);
      }}
    />
  );
}

export const FotoRemota = memo(FotoRemotaComponent);
