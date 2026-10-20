import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { memo, useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { FotoRemota } from '@/components/ui/FotoRemota';
import { tipoDeMedio, type TipoMedio } from '@/lib/medios';

/**
 * Lo que se ve de un banner, sea foto, GIF o video (0044). Los tres llenan
 * el recuadro del banner sin deformarse ("cover": lo que sobre de los bordes
 * queda fuera).
 *
 * El video va SIEMPRE sin sonido y sin controles, y solo se reproduce
 * mientras su banner está en pantalla (`activo`): fuera de ella se detiene
 * para no gastar batería ni datos.
 */
function MedioBannerComponent({
  uri,
  ancho,
  style,
  activo = true,
  enBucle = true,
  onTermino,
  tipo: tipoForzado,
}: {
  uri: string;
  ancho: number;
  /** Qué es, si no se sabe por la extensión (un archivo recién elegido de la galería). */
  tipo?: TipoMedio;
  style?: StyleProp<ViewStyle>;
  /** Si el banner está en pantalla: solo entonces corre el video. */
  activo?: boolean;
  /** El video vuelve a empezar al terminar (si no, avisa con `onTermino`). */
  enBucle?: boolean;
  onTermino?: () => void;
}) {
  const tipo = tipoForzado ?? tipoDeMedio(uri);
  if (tipo === 'video') {
    return <VideoBanner uri={uri} style={style} activo={activo} enBucle={enBucle} onTermino={onTermino} />;
  }
  if (tipo === 'gif') {
    // Sin achicar: la versión achicada de Supabase dejaría el GIF quieto.
    return (
      <View style={style}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" autoplay cachePolicy="memory-disk" />
      </View>
    );
  }
  return (
    <View style={style}>
      <FotoRemota uri={uri} ancho={ancho} style={StyleSheet.absoluteFill} />
    </View>
  );
}

function VideoBanner({
  uri,
  style,
  activo,
  enBucle,
  onTermino,
}: {
  uri: string;
  style?: StyleProp<ViewStyle>;
  activo: boolean;
  enBucle: boolean;
  onTermino?: () => void;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.volume = 0;
    p.loop = enBucle;
  });

  useEffect(() => {
    player.loop = enBucle;
  }, [player, enBucle]);

  // Solo corre en pantalla; al volver a ella, empieza desde el principio.
  useEffect(() => {
    if (activo) {
      player.currentTime = 0;
      player.play();
    } else {
      player.pause();
    }
  }, [player, activo]);

  const fin = useEvent(player, 'playToEnd');
  useEffect(() => {
    if (fin !== undefined && activo) onTermino?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fin]);

  return (
    <View style={style}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
    </View>
  );
}

export const MedioBanner = memo(MedioBannerComponent);
