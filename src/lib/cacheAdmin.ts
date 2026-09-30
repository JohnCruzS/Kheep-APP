import { BannerAdmin, ComunaAdmin, fetchBannersActivosAdmin, fetchComunasAdmin } from '@/lib/catalog';
import { LogoTematico, MedidasLogo, fetchLogosAdmin, fetchMedidasLogo } from '@/lib/marca';

/**
 * Lo último que se trajo para las pantallas del panel que más se abren
 * (Comunas, Título y Banners), guardado en memoria mientras la app está abierta.
 *
 * El panel lo pide en segundo plano apenas se entra a Admin: cuando el
 * administrador toca "Título" o "Banners", los datos ya están y la pantalla
 * aparece completa, sin la ruedita de carga. Al entrar, igual se vuelve a
 * pedir por detrás para mostrar lo más nuevo.
 */

let banners: BannerAdmin[] | null = null;
let comunas: ComunaAdmin[] | null = null;
let titulo: { logos: LogoTematico[]; medidas: MedidasLogo } | null = null;

export function bannersEnMemoria(): BannerAdmin[] | null {
  return banners;
}

export async function precargarBanners(): Promise<BannerAdmin[]> {
  banners = await fetchBannersActivosAdmin();
  return banners;
}

export function comunasEnMemoria(): ComunaAdmin[] | null {
  return comunas;
}

export async function precargarComunas(): Promise<ComunaAdmin[]> {
  comunas = await fetchComunasAdmin();
  return comunas;
}

/** Tras mostrar u ocultar una comuna, para que al volver se vea el cambio. */
export function recordarComunas(lista: ComunaAdmin[]): void {
  comunas = lista;
}

export function tituloEnMemoria(): { logos: LogoTematico[]; medidas: MedidasLogo } | null {
  return titulo;
}

export async function precargarTitulo(): Promise<{ logos: LogoTematico[]; medidas: MedidasLogo }> {
  const [logos, medidas] = await Promise.all([fetchLogosAdmin(), fetchMedidasLogo()]);
  titulo = { logos, medidas };
  return titulo;
}

/** Tras guardar medidas nuevas, para que al volver a entrar se vean esas. */
export function recordarMedidasTitulo(medidas: MedidasLogo): void {
  if (titulo) titulo = { ...titulo, medidas };
}
