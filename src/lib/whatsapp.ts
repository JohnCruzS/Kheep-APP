import { Linking } from 'react-native';

import { logWhatsappClic } from '@/lib/catalog';

/**
 * Abre WhatsApp con un mensaje precargado hacia el teléfono del comercio, y
 * registra la métrica de conversión. El teléfono ya viene validado en
 * formato +569XXXXXXXX por un constraint de la base de datos (migración
 * 0007), así que aquí solo se le quita el "+" para armar el link wa.me.
 */
export async function contactarPorWhatsApp(publicacionId: string, telefono: string, titulo: string) {
  await logWhatsappClic(publicacionId);

  const numero = telefono.replace(/[^\d]/g, '');
  const mensaje = encodeURIComponent(`Hola! Vi "${titulo}" en Kheep y quería consultar 🙂`);
  const url = `https://wa.me/${numero}?text=${mensaje}`;

  const canOpen = await Linking.canOpenURL(url);
  if (canOpen) {
    await Linking.openURL(url);
  }
}
