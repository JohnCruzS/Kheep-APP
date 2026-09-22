import type { Session } from '@supabase/supabase-js';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useState } from 'react';

import { PermisosAdmin, fetchMisPermisosAdmin } from '@/lib/administradores';
import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  nombre: string;
  telefono_contacto: string | null;
  logo_url: string | null;
  /** admin = administrador general; admin_zona = solo en sus comunas (0027). */
  rol: 'comerciante' | 'admin' | 'admin_zona';
  nivel: 1 | 2;
};

type SessionContextValue = {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  refreshProfile: () => Promise<void>;
  /**
   * Verdadero mientras alguien restablece su contraseña. Validar el código
   * del correo YA inicia sesión, y sin esto el layout de acceso lo mandaría
   * al inicio antes de que alcance a escribir la contraseña nueva.
   */
  recuperando: boolean;
  setRecuperando: (valor: boolean) => void;
  /**
   * Qué puede hacer como administrador, general o de zona. null para quien
   * no administra nada. Decide qué pantallas y botones se muestran; la base
   * lo vuelve a comprobar en cada acción.
   */
  permisos: PermisosAdmin | null;
};

const SessionContext = createContext<SessionContextValue>({
  session: null,
  profile: null,
  isLoading: true,
  refreshProfile: async () => {},
  recuperando: false,
  setRecuperando: () => {},
  permisos: null,
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
  const [recuperando, setRecuperando] = useState(false);
  const [permisos, setPermisos] = useState<PermisosAdmin | null>(null);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      setPermisos(null);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('id, nombre, telefono_contacto, logo_url, rol, nivel')
      .eq('id', userId)
      .maybeSingle();
    const perfil = (data as Profile) ?? null;

    // Una cuenta suspendida no puede iniciar sesión (lo rechaza Supabase),
    // pero una sesión abierta de antes seguiría viva hasta que venza. Se
    // cierra acá; al intentar entrar de nuevo verá el aviso de suspensión.
    const suspendida = await supabase.rpc('cuenta_suspendida', { p_usuario: userId });
    if (!suspendida.error && suspendida.data === true) {
      await supabase.auth.signOut();
      setProfile(null);
      setPermisos(null);
      return;
    }

    setProfile(perfil);

    if (perfil?.rol === 'admin' || perfil?.rol === 'admin_zona') {
      try {
        setPermisos(await fetchMisPermisosAdmin());
      } catch {
        // Sin la migración 0027 la función no existe: el general sigue siendo
        // general, que es lo que era antes de los administradores de zona.
        setPermisos(perfil.rol === 'admin' ? { esGeneral: true, permisos: [], comunas: [] } : null);
      }
    } else {
      setPermisos(null);
    }
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
    <SessionContext.Provider value={{ session, profile, isLoading, refreshProfile, recuperando, setRecuperando, permisos }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
