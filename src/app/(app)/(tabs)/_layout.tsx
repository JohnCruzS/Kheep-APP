import { Ionicons } from '@expo/vector-icons';
import { Tabs, type BottomTabBarButtonProps } from 'expo-router/js-tabs';
import { Pressable } from 'react-native';

import { Colors } from '@/constants/theme';
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
  const { profile } = useSession();
  const isAdmin = profile?.rol === 'admin';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.background,
          borderTopColor: Colors.surfaceBorder,
          borderTopWidth: 1,
          height: 58,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
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
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Panel Admin',
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} />,
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
