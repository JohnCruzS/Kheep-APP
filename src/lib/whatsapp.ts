import { Alert, Linking } from 'react-native';

import { logWhatsappClic } from '@/lib/catalog';

/**
 * Abre WhatsApp con un mensaje precargado hacia el teléfono del comercio, y
 * registra la métrica de conversión. El teléfono ya viene validado en
 * formato +569XXXXXXXX por un constraint de la base de datos (migración
 * 0007), así que aquí solo se le quita el "+" para armar el enlace.
 *
 * Dos cosas que antes lo dejaban sin hacer nada, en silencio:
 *
 *  - La métrica se registraba ANTES y con `await`: si esa consulta fallaba
 *    (sin señal, por ejemplo), la función se cortaba ahí y WhatsApp no se
 *    abría. Contactar es lo importante; la métrica va aparte y si se pierde,
 *    se pierde.
 *  - Se preguntaba con `canOpenURL` y solo se abría si decía que sí. En
 *    varios Android esa pregunta devuelve "no" aunque el enlace sí se pueda
 *    abrir, y el toque no hacía absolutamente nada. Ahora se intenta abrir
 *    directamente, primero la app de WhatsApp y si no, su página, y solo si
 *    ambas fallan se avisa.
 */
export async function contactarPorWhatsApp(publicacionId: string, telefono: string, titulo: string) {
  // En segundo plano: que un problema con la métrica no impida el contacto.
  void logWhatsappClic(publicacionId).catch(() => {});

  const numero = telefono.replace(/[^\d]/g, '');
  const mensaje = encodeURIComponent(`Hola! Vi "${titulo}" en Kheep y quería consultar 🙂`);
  const enlaces = [`whatsapp://send?phone=${numero}&text=${mensaje}`, `https://wa.me/${numero}?text=${mensaje}`];

  for (const enlace of enlaces) {
    try {
      await Linking.openURL(enlace);
      return;
    } catch {
      // Se prueba con el siguiente.
    }
  }

  Alert.alert(
    'No se pudo abrir WhatsApp',
    `Escríbele al ${telefono}. Si no tienes WhatsApp instalado, puedes instalarlo y volver a intentar.`,
  );
}
