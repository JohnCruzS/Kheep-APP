import type { Session } from '@supabase/supabase-js';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  nombre: string;
  telefono_contacto: string | null;
  logo_url: string | null;
  rol: 'comerciante' | 'admin';
  nivel: 1 | 2;
};

type SessionContextValue = {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  refreshProfile: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue>({
  session: null,
  profile: null,
  isLoading: true,
  refreshProfile: async () => {},
});

/**
 * Única fuente de verdad de la sesión (y del perfil/rol asociado) para TODO
 * el árbol de navegación. Se monta una sola vez en el layout raíz — si cada
 * pantalla consultara su propia sesión de forma independiente, cada una
 * arrancaría con session=null antes de resolver su propia promesa, y como
 * expo-router desmonta/remonta layouts al redirigir entre grupos, eso
 * produce un ping-pong infinito entre "/(auth)" y "/(app)" (visto en
 * producción: 252 renders en 9 segundos). Con un solo Provider en la raíz,
 * el valor es estable y consistente para toda la app.
 *
 * `profile` (rol/nivel) se carga aparte de `session`: es lo que decide qué
 * ve cada quien (pestaña de admin, insignia de verificado, etc.) — nunca se
 * asume desde el cliente, siempre se lee de `public.profiles`.
 */
export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('id, nombre, telefono_contacto, logo_url, rol, nivel')
      .eq('id', userId)
      .maybeSingle();
    setProfile((data as Profile) ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      loadProfile(newSession?.user.id);
    });

    return () => subscription.subscription.unsubscribe();
  }, [loadProfile]);

  const refreshProfile = useCallback(() => loadProfile(session?.user.id), [loadProfile, session]);

  return (
    <SessionContext.Provider value={{ session, profile, isLoading, refreshProfile }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
