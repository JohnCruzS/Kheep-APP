import type { Session } from '@supabase/supabase-js';
import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

type SessionContextValue = {
  session: Session | null;
  isLoading: boolean;
};

const SessionContext = createContext<SessionContextValue>({ session: null, isLoading: true });

/**
 * Única fuente de verdad de la sesión para TODO el árbol de navegación.
 * Se monta una sola vez en el layout raíz — si cada pantalla consultara su
 * propia sesión de forma independiente, cada una arrancaría con
 * session=null antes de resolver su propia promesa, y como expo-router
 * desmonta/remonta layouts al redirigir entre grupos, eso produce un
 * ping-pong infinito entre "/(auth)" y "/(app)" (visto en producción: 252
 * renders en 9 segundos). Con un solo Provider en la raíz, el valor es
 * estable y consistente para toda la app.
 */
export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return (
    <SessionContext.Provider value={{ session, isLoading }}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
