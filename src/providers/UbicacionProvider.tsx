import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { guardarComunaElegida, leerComunaGuardada } from '@/lib/arranque';

type EstadoArranque =
  /** Leyendo lo que hay guardado en el teléfono. Dura un parpadeo. */
  | 'cargando'
  /** Primer arranque: hay que pedir el permiso y averiguar la comuna. */
  | 'bienvenida'
  /** Ya hay comuna: se muestra el catálogo. */
  | 'listo';

type Valor = {
  estado: EstadoArranque;
  /** Comuna del catálogo. null = todas las comunas. */
  comunaId: string | null;
  /** Fija la comuna y la recuerda para las próximas aperturas. */
  elegirComuna: (comunaId: string | null) => void;
};

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

  useEffect(() => {
    let vivo = true;
    leerComunaGuardada().then((guardada) => {
      if (!vivo) return;
      if (guardada.configurado) {
        setComunaId(guardada.comunaId);
        setEstado('listo');
      } else {
        setEstado('bienvenida');
      }
    });
    return () => {
      vivo = false;
    };
  }, []);

  const elegirComuna = useCallback((id: string | null) => {
    setComunaId(id);
    setEstado('listo');
    void guardarComunaElegida(id);
  }, []);

  const valor = useMemo<Valor>(() => ({ estado, comunaId, elegirComuna }), [estado, comunaId, elegirComuna]);

  return <UbicacionContext.Provider value={valor}>{children}</UbicacionContext.Provider>;
}

export function useUbicacion(): Valor {
  const valor = useContext(UbicacionContext);
  if (!valor) throw new Error('useUbicacion se usó fuera de UbicacionProvider.');
  return valor;
}
