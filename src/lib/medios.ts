import { decode } from 'base64-arraybuffer';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { FORMATO_RECORTE } from '@/lib/rejilla';
import { supabase } from '@/lib/supabase';

/**
 * Banners del admin con foto, GIF o video (0044). Los límites son para que
 * no pesen en Supabase ni gasten los datos de quien abre la app:
 */
export const LIMITES_MEDIO = {
  /** Un GIF pesa mucho para lo que muestra: tope bajo. */
  gifBytes: 2 * 1024 * 1024,
  videoBytes: 4 * 1024 * 1024,
  videoSegundos: 10,
} as const;

export type TipoMedio = 'imagen' | 'gif' | 'video';

/** Qué es un banner, por la extensión de su archivo. */
export function tipoDeMedio(url: string): TipoMedio {
  const limpia = url.split('?')[0].toLowerCase();
  if (limpia.endsWith('.mp4')) return 'video';
  if (limpia.endsWith('.gif')) return 'gif';
  return 'imagen';
}

export type MedioElegido = {
  uri: string;
  tipo: TipoMedio;
  contentType: 'image/jpeg' | 'image/gif' | 'video/mp4';
  /** Solo las fotos: ya recortadas y comprimidas. */
  base64?: string;
};

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Abre la galería para elegir la foto, el GIF o el video de un banner.
 *
 *  - Foto: se recorta al centro en la forma del banner (19:9) y se comprime,
 *    igual que siempre.
 *  - GIF y video: se suben tal cual (recortarlos los dejaría quietos o sin
 *    imagen), pero se rechazan si pasan los límites, diciendo por qué. Al
 *    mostrarse llenan el recuadro del banner sin deformarse: lo que sobre de
 *    los bordes queda fuera. Conviene que vengan ya en 19:9.
 */
export async function elegirMedioBanner(): Promise<MedioElegido | null> {
  const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permiso.granted) throw new Error('Necesitamos permiso para acceder a tus fotos.');

  const resultado = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsEditing: false,
    quality: 1,
    videoMaxDuration: LIMITES_MEDIO.videoSegundos,
  });
  if (resultado.canceled || resultado.assets.length === 0) return null;
  const a = resultado.assets[0];
  const tamano = a.fileSize ?? new File(a.uri).size ?? 0;

  if (a.type === 'video') {
    const segundos = (a.duration ?? 0) / 1000;
    if (segundos > LIMITES_MEDIO.videoSegundos + 0.5) {
      throw new Error(`El video dura ${Math.round(segundos)} segundos: el máximo es ${LIMITES_MEDIO.videoSegundos}.`);
    }
    if (tamano > LIMITES_MEDIO.videoBytes) {
      throw new Error(`El video pesa ${mb(tamano)}: el máximo es ${mb(LIMITES_MEDIO.videoBytes)}.`);
    }
    const tipoArchivo = (a.mimeType ?? '').toLowerCase();
    if (tipoArchivo && tipoArchivo !== 'video/mp4') throw new Error('El video tiene que ser MP4.');
    return { uri: a.uri, tipo: 'video', contentType: 'video/mp4' };
  }

  const esGif = (a.mimeType ?? '').toLowerCase() === 'image/gif' || a.uri.toLowerCase().endsWith('.gif');
  if (esGif) {
    if (tamano > LIMITES_MEDIO.gifBytes) {
      throw new Error(`El GIF pesa ${mb(tamano)}: el máximo es ${mb(LIMITES_MEDIO.gifBytes)}.`);
    }
    return { uri: a.uri, tipo: 'gif', contentType: 'image/gif' };
  }

  // Foto: recorte al centro en la forma del banner y compresión.
  const [fx, fy] = FORMATO_RECORTE.banner;
  let ancho = a.width;
  let alto = Math.round((a.width * fy) / fx);
  if (alto > a.height) {
    alto = a.height;
    ancho = Math.round((a.height * fx) / fy);
  }
  const acciones: ImageManipulator.Action[] = [
    { crop: { originX: Math.round((a.width - ancho) / 2), originY: Math.round((a.height - alto) / 2), width: ancho, height: alto } },
  ];
  if (ancho > 1280) acciones.push({ resize: { width: 1280 } });
  const foto = await ImageManipulator.manipulateAsync(a.uri, acciones, {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  if (!foto.base64) throw new Error('No se pudo procesar la imagen.');
  return { uri: foto.uri, tipo: 'imagen', contentType: 'image/jpeg', base64: foto.base64 };
}

/** Sube el medio del banner a la carpeta del usuario y devuelve su URL pública. */
export async function subirMedioBanner(userId: string, medio: MedioElegido): Promise<string> {
  const extension = medio.tipo === 'video' ? 'mp4' : medio.tipo === 'gif' ? 'gif' : 'jpg';
  const path = `${userId}/banner-${Date.now()}.${extension}`;
  const cuerpo = medio.base64 ? decode(medio.base64) : await new File(medio.uri).bytes();
  const { error } = await supabase.storage.from('banners').upload(path, cuerpo, {
    contentType: medio.contentType,
    upsert: true,
  });
  if (error) {
    if (/mime|not supported|invalid.*type/i.test(error.message ?? '')) {
      throw new Error('Falta ejecutar la migración 0044 en Supabase para subir GIF y video.');
    }
    throw error;
  }
  return supabase.storage.from('banners').getPublicUrl(path).data.publicUrl;
}
