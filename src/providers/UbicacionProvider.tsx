import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { guardarComunaElegida, leerComunaGuardada } from '@/lib/arranque';
import { fetchComunas } from '@/lib/catalog';
import { detectarComunaActual, tienePermisoUbicacion } from '@/lib/location';

type EstadoArranque =
  /** Leyendo lo que hay guardado en el teléfono. Dura un parpadeo. */
  | 'cargando'
  /** Primer arranque: hay que pedir el permiso y averiguar la comuna. */
  | 'bienvenida'
  /**
   * Carga intermedia: se acaba de elegir una comuna y el catálogo se está
   * armando (documento EDIT APP). Es el fondo negro con la marca, igual que
   * el arranque, para que el cambio no se vea como un parpadeo.
   */
  | 'cambiando'
  /** Ya hay comuna: se muestra el catálogo. */
  | 'listo';

type Valor = {
  estado: EstadoArranque;
  /** Comuna del catálogo. null = todas las comunas. */
  comunaId: string | null;
  /** Fija la comuna y la recuerda para las próximas aperturas. */
  elegirComuna: (comunaId: string | null) => void;
  /**
   * El catálogo de la comuna ya está armado (comuna, categorías y comercios).
   * Hasta entonces, sobre la app va la pantalla de arranque: así el inicio
   * nunca se ve a medio cargar.
   */
  catalogoListo: boolean;
  /** Lo avisa el inicio cuando terminó de cargar su primera tanda de datos. */
  avisarCatalogoListo: () => void;
  /**
   * El GPS dice que el usuario está en otra comuna distinta de la guardada.
   * Nunca se cambia solo: se le pregunta (documento EDIT APP, "ID GPS – Cfm
   * – Última").
   */
  sugerencia: { id: string; nombre: string } | null;
  descartarSugerencia: () => void;
};

/**
 * Mínimo que dura la carga intermedia al elegir comuna.
 *
 * Lo que de verdad manda es el catálogo: la pantalla de arranque se queda
 * hasta que la comuna nueva tiene sus categorías y sus comercios (ver
 * `catalogoListo`). Este mínimo solo evita que, cuando la respuesta llega
 * muy rápido, la pantalla aparezca y desaparezca de golpe.
 *
 * Antes eran 3 segundos fijos y se esperaba de más aunque los datos ya
 * estuvieran.
 */
const CARGA_INTERMEDIA = 400;

const UbicacionContext = createContext<Valor | null>(null);

/**
 * En qué comuna está parado el catálogo, y si ya se resolvió esa pregunta.
 *
 * Vive sobre toda la app y no dentro del catálogo porque la respuesta se
 * decide antes de que el catálogo exista: en el primer arranque la app
 * muestra la bienvenida (permiso de ubicación → detectar comuna, o elegirla a
 * mano) y recién con una comuna definida entra al contenido. En las aperturas
 * siguientes se lee la comuna guardada y se entra directo.
 */
export function UbicacionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoArranque>('cargando');
  const [comunaId, setComunaId] = useState<string | null>(null);
  /** La comuna actual, para poder leerla dentro de callbacks sin recrearlos. */
  const comunaIdRef = useRef<string | null>(null);
  const [sugerencia, setSugerencia] = useState<{ id: string; nombre: string } | null>(null);
  const [catalogoListo, setCatalogoListo] = useState(false);

  useEffect(() => {
    let vivo = true;
    leerComunaGuardada().then((guardada) => {
      if (!vivo) return;
      if (guardada.configurado) {
        setComunaId(guardada.comunaId);
        setEstado('listo');
        // Con el permiso ya dado, se vuelve a mirar dónde está: si se mudó o
        // está de viaje, se le ofrece cambiar. Va en segundo plano, después
        // de mostrar el catálogo con la última comuna, para no hacer esperar
        // a nadie por el GPS.
        void revisarUbicacion(guardada.comunaId);
      } else {
        setEstado('bienvenida');
      }
    });
    return () => {
      vivo = false;
    };
  }, []);

  /**
   * Compara la comuna guardada con la que dice el GPS. Solo prepara la
   * pregunta: el cambio siempre lo confirma el usuario.
   */
  async function revisarUbicacion(guardadaId: string | null) {
    try {
      if (!(await tienePermisoUbicacion())) return;
      const comunas = await fetchComunas();
      const detectada = await detectarComunaActual(comunas);
      if (!detectada || detectada === guardadaId) return;
      const nombre = comunas.find((c) => c.id === detectada)?.nombre;
      if (nombre) setSugerencia({ id: detectada, nombre });
    } catch {
      // Sin señal, sin permiso o sin red: se sigue con la última comuna.
    }
  }

  const avisarCatalogoListo = useCallback(() => setCatalogoListo(true), []);

  const elegirComuna = useCallback((id: string | null) => {
    // Elegir la que ya estaba no recarga nada: el catálogo es el mismo, y
    // marcarlo como "por armar" dejaba la pantalla de arranque puesta
    // esperando un aviso que nunca iba a llegar.
    if (id === comunaIdRef.current) return;
    setComunaId(id);
    // El catálogo de la comuna nueva se arma de cero.
    setCatalogoListo(false);
    setSugerencia(null);
    void guardarComunaElegida(id);

    // Carga intermedia antes de mostrar el contenido de la comuna nueva.
    setEstado('cambiando');
    setTimeout(() => setEstado('listo'), CARGA_INTERMEDIA);
  }, []);

  const descartarSugerencia = useCallback(() => setSugerencia(null), []);

  const valor = useMemo<Valor>(
    () => ({ estado, comunaId, elegirComuna, sugerencia, descartarSugerencia, catalogoListo, avisarCatalogoListo }),
    [estado, comunaId, elegirComuna, sugerencia, descartarSugerencia, catalogoListo, avisarCatalogoListo],
  );

  useEffect(() => {
    comunaIdRef.current = comunaId;
  }, [comunaId]);

  return <UbicacionContext.Provider value={valor}>{children}</UbicacionContext.Provider>;
}

export function useUbicacion(): Valor {
  const valor = useContext(UbicacionContext);
  if (!valor) throw new Error('useUbicacion se usó fuera de UbicacionProvider.');
  return valor;
}
