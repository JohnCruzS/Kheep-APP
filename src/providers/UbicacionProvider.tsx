import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

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
   * El GPS dice que el usuario está en otra comuna distinta de la guardada.
   * Nunca se cambia solo: se le pregunta (documento EDIT APP, "ID GPS – Cfm
   * – Última").
   */
  sugerencia: { id: string; nombre: string } | null;
  descartarSugerencia: () => void;
};

/**
 * Cuánto dura la carga intermedia al elegir comuna. Tres segundos y no uno:
 * con una conexión lenta, el catálogo de la comuna nueva todavía viene en
 * camino, y entrar a una pantalla a medio cargar se ve peor que esperar.
 */
const CARGA_INTERMEDIA = 3000;

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
  const [sugerencia, setSugerencia] = useState<{ id: string; nombre: string } | null>(null);

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

  const elegirComuna = useCallback((id: string | null) => {
    setComunaId(id);
    setSugerencia(null);
    void guardarComunaElegida(id);

    // Carga intermedia antes de mostrar el contenido de la comuna nueva.
    setEstado('cambiando');
    setTimeout(() => setEstado('listo'), CARGA_INTERMEDIA);
  }, []);

  const descartarSugerencia = useCallback(() => setSugerencia(null), []);

  const valor = useMemo<Valor>(
    () => ({ estado, comunaId, elegirComuna, sugerencia, descartarSugerencia }),
    [estado, comunaId, elegirComuna, sugerencia, descartarSugerencia],
  );

  return <UbicacionContext.Provider value={valor}>{children}</UbicacionContext.Provider>;
}

export function useUbicacion(): Valor {
  const valor = useContext(UbicacionContext);
  if (!valor) throw new Error('useUbicacion se usó fuera de UbicacionProvider.');
  return valor;
}
