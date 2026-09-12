import { decode } from 'base64-arraybuffer';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

/**
 * Reglas de peso/dimensión de imágenes para toda la app. Coordinado con los
 * límites duros configurados en Supabase Storage (ver migración 0007):
 * ese es el límite del servidor que no se puede saltar; esto es lo que hace
 * que casi nunca se llegue a rozarlo, comprimiendo desde el origen.
 */
const MAX_DIMENSION = 1280; // ancho/alto máximo en píxeles
const JPEG_QUALITY = 0.7; // 0-1, calidad de compresión

export type PickedImage = {
  uri: string;
  base64: string;
  contentType: 'image/jpeg' | 'image/png';
};

type OpcionesImagen = {
  aspect?: [number, number];
  /** Si se abre el recorte del sistema. Para logos no: se respeta la forma original. */
  recortar?: boolean;
  /**
   * JPEG para fotos (pesa poco). PNG para logos: JPEG no tiene transparencia
   * y un logo con fondo transparente quedaría con un recuadro de color.
   */
  formato?: 'jpeg' | 'png';
};

/**
 * Abre el selector de galería, y devuelve la imagen ya redimensionada y
 * comprimida a JPEG — nunca el archivo original tal cual lo tenía el
 * usuario (que puede pesar 10-20MB en un celular moderno).
 */
export async function pickAndCompressImage(
  opciones: [number, number] | OpcionesImagen = [1, 1],
): Promise<PickedImage | null> {
  const { aspect = [1, 1], recortar = true, formato = 'jpeg' } = Array.isArray(opciones)
    ? { aspect: opciones }
    : opciones;

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Necesitamos permiso para acceder a tus fotos.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1, // la compresión real la hacemos nosotros abajo, con control fino
    allowsEditing: recortar,
    ...(recortar ? { aspect } : {}),
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  const original = result.assets[0];

  const png = formato === 'png';
  // Solo se achica si es más grande que el máximo: agrandar una imagen chica
  // no gana nitidez y solo la hace pesar más.
  const acciones = original.width > MAX_DIMENSION ? [{ resize: { width: MAX_DIMENSION } }] : [];
  const manipulated = await ImageManipulator.manipulateAsync(original.uri, acciones, {
    compress: png ? 1 : JPEG_QUALITY,
    format: png ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });

  if (!manipulated.base64) {
    throw new Error('No se pudo procesar la imagen.');
  }

  return { uri: manipulated.uri, base64: manipulated.base64, contentType: png ? 'image/png' : 'image/jpeg' };
}

/**
 * Sube una imagen ya comprimida a un bucket, respetando la convención de
 * carpetas que exigen las policies de Storage: {bucket}/{auth.uid()}/...
 * (ver migración 0003). Devuelve la URL pública lista para guardar en la
 * tabla correspondiente (logo_url / imagen_url).
 */
export async function uploadCompressedImage(
  bucket: 'logos' | 'productos' | 'banners',
  userId: string,
  image: PickedImage,
  fileNamePrefix: string,
): Promise<string> {
  const extension = image.contentType === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/${fileNamePrefix}-${Date.now()}.${extension}`;

  const { error } = await supabase.storage.from(bucket).upload(path, decode(image.base64), {
    contentType: image.contentType,
    upsert: true,
  });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
