import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Tabs, type BottomTabBarButtonProps } from 'expo-router/js-tabs';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts } from '@/constants/theme';
import { useSession } from '@/providers/SessionProvider';

/**
 * Barra de navegación inferior real (spec: "Navegación Inferior
 * Persistente"). Antes esto se simulaba a mano con `router.replace` entre
 * pantallas — eso destruye y vuelve a montar cada pantalla en cada cambio de
 * pestaña (vuelve a pedir todo a Supabase, se siente "pegado"). Con `Tabs`
 * las 4 pantallas quedan montadas una sola vez y cambiar de pestaña es
 * instantáneo, como en cualquier app nativa.
 */
export default function TabsLayout() {
  const { session, profile } = useSession();
  const router = useRouter();
  // Alto de la barra de navegación del sistema (3 botones o gestos). La app
  // se dibuja por detrás de ella, así que la barra de pestañas debe sumar
  // ese espacio; si no, en teléfonos con 3 botones quedan encimadas y los
  // botones de la app no se pueden tocar.
  const insets = useSafeAreaInsets();
  // General o de zona: los dos tienen las pestañas de administración; lo
  // que ve cada uno adentro depende de sus permisos.
  const isAdmin = profile?.rol === 'admin' || profile?.rol === 'admin_zona';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        // Sin sesión la barra no aporta nada: "Publicar" y "Panel Admin" ya
        // están ocultos, e "Inicio" es la única pantalla. El invitado entra a
        // su cuenta tocando el logo del catálogo, así que la barra se
        // esconde entera y aparece recién al iniciar sesión.
        tabBarStyle: session
          ? {
              backgroundColor: Colors.background,
              borderTopColor: Colors.surfaceBorder,
              borderTopWidth: 1,
              height: 58 + insets.bottom,
              paddingBottom: 6 + insets.bottom,
              paddingTop: 6,
            }
          : { display: 'none' },
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: Fonts.medium,
        },
        tabBarButton: (props) => <TabButton {...props} />,
      }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="publicar"
        options={{
          title: 'Publicar',
          // Oculta para invitados (no tienen cuenta) y también para admin:
          // el admin modera desde "Panel Admin", no publica comercios
          // propios.
          href: session && !isAdmin ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          // Para el admin, la segunda pestaña son las comunas: es donde
          // administra el catálogo de cada una (categorías y perfiles).
          title: 'Comunas',
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="location" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          // La tercera pestaña cambia de papel según quién entra: para el
          // admin es el panel general (título, aprobar, banners, métricas) y
          // para un comerciante, su perfil. Ver (tabs)/perfil.tsx.
          title: isAdmin ? 'Admin' : 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={isAdmin ? 'shield-checkmark' : 'person-circle'} color={color} size={size} />
          ),
        }}
        listeners={{
          // Sin sesión, "Perfil" no llega a abrirse: se cancela el cambio de
          // pestaña y se abre el login encima. Así hay una sola pantalla de
          // acceso en la app, y "atrás" desde el login vuelve a Inicio en vez
          // de caer en una pestaña vacía que volvería a mandar al login.
          tabPress: (e) => {
            if (!session) {
              e.preventDefault();
              router.push('/(auth)/login');
            }
          },
        }}
      />
    </Tabs>
  );
}

/**
 * Quita el "ripple"/highlight gris por defecto de Android en los botones de
 * la barra — con el fondo negro se veía como un parche pegado al tocar.
 */
function TabButton({ children, style, onPress, onLongPress, accessibilityState }: BottomTabBarButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityState={accessibilityState}
      style={style}
      android_ripple={{ color: 'transparent' }}>
      {children}
    </Pressable>
  );
}
