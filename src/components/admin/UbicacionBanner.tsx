import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/catalog/CatalogState";
import { Button } from "@/components/ui/Button";
import { EncabezadoMarca } from "@/components/ui/EncabezadoMarca";
import { Interruptor } from "@/components/ui/Interruptor";
import { Text } from "@/components/ui/Texto";
import { Colors, Fonts, Spacing, TarjetaLista } from "@/constants/theme";
import { ComunaAdmin, fetchComunasAdmin } from "@/lib/catalog";
import { REJILLA, u } from "@/lib/rejilla";
import { compararRegiones, nombreRegion } from "@/lib/regiones";

/**
 * Dónde se muestra un banner (botón "Ubicación" de Banners, maqueta del
 * cliente): la lista de regiones con sus comunas, encendidas las que tienen
 * el banner. Las regiones donde está aparecen abiertas con sus comunas; tocar
 * el nombre de una región la abre o la cierra.
 *
 * `comunaIds` null = se muestra en todas las comunas.
 */
export function UbicacionBanner({
  visible,
  comunaIds,
  onClose,
}: {
  visible: boolean;
  comunaIds: string[] | null;
  onClose: () => void;
}) {
  const [comunas, setComunas] = useState<ComunaAdmin[] | null>(null);
  const [abiertas, setAbiertas] = useState<string[]>([]);

  useEffect(() => {
    if (!visible || comunas) return;
    fetchComunasAdmin()
      .then(setComunas)
      .catch(() => setComunas([]));
  }, [visible, comunas]);

  const presente = (id: string) => comunaIds === null || comunaIds.includes(id);
  const regiones = useMemo(
    () =>
      [...new Set((comunas ?? []).map((c) => c.region))].sort(compararRegiones),
    [comunas],
  );
  const comunasDe = (region: string) =>
    (comunas ?? []).filter((c) => c.region === region);

  // Al abrir, quedan desplegadas las regiones donde está el banner.
  useEffect(() => {
    if (!visible || !comunas) return;
    setAbiertas(
      comunaIds === null
        ? []
        : [
            ...new Set(
              comunas
                .filter((c) => comunaIds.includes(c.id))
                .map((c) => c.region),
            ),
          ],
    );
  }, [visible, comunas, comunaIds]);

  return (
    <Modal visible={visible} animationType="none" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <EncabezadoMarca subtitulo="Ubicación" />
        {!comunas ? (
          <LoadingState />
        ) : (
          <ScrollView
            contentContainerStyle={styles.contenido}
            showsVerticalScrollIndicator={false}
          >
            {regiones.map((region) => {
              const suyas = comunasDe(region);
              const enRegion = suyas.filter((c) => presente(c.id)).length;
              const abierta = abiertas.includes(region);
              return (
                <View key={region} style={styles.tarjetaRegion}>
                  <View style={styles.cabeceraRegion}>
                    <Pressable
                      style={styles.zonaNombre}
                      onPress={() =>
                        setAbiertas((a) =>
                          a.includes(region)
                            ? a.filter((r) => r !== region)
                            : [...a, region],
                        )
                      }
                      hitSlop={6}
                    >
                      <Text style={styles.region} numberOfLines={1}>
                        {nombreRegion(region)}
                      </Text>
                    </Pressable>
                    {/* Solo muestra dónde está: no se toca, pero con su color normal. */}
                    <View pointerEvents="none">
                      <Interruptor
                        value={enRegion > 0}
                        onValueChange={() => {}}
                        accessibilityLabel={`${nombreRegion(region)}: ${enRegion > 0 ? "presente" : "no presente"}`}
                      />
                    </View>
                  </View>
                  {abierta && (
                    <View style={styles.comunas}>
                      {suyas.map((comuna) => (
                        <View key={comuna.id} style={styles.filaComuna}>
                          <Text style={styles.comuna} numberOfLines={1}>
                            {comuna.nombre}
                          </Text>
                          <View pointerEvents="none">
                            <Interruptor
                              value={presente(comuna.id)}
                              onValueChange={() => {}}
                              accessibilityLabel={`${comuna.nombre}: ${presente(comuna.id) ? "presente" : "no presente"}`}
                            />
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
            {/* Al final de la lista, no flotando encima. */}
            <View style={styles.ok}>
              <Button label="Ok" onPress={onClose} />
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contenido: {
    paddingHorizontal: u(REJILLA.margenLateral),
    paddingBottom: Spacing.four,
  },
  tarjetaRegion: {
    backgroundColor: TarjetaLista.fondo,
    borderRadius: u(REJILLA.curvatura),
    borderWidth: 1,
    borderColor: TarjetaLista.borde,
    marginBottom: u(REJILLA.margenLateral),
    paddingHorizontal: TarjetaLista.sangria,
  },
  cabeceraRegion: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    height: u(240) - 2,
  },
  zonaNombre: {
    flex: 1,
  },
  region: {
    fontFamily: Fonts.tarjeta,
    fontSize: TarjetaLista.tamanoTexto,
    color: Colors.text,
  },
  comunas: {
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  filaComuna: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: Spacing.four,
  },
  comuna: {
    flex: 1,
    fontFamily: Fonts.delgada,
    fontSize: 21,
    color: Colors.text,
  },
  ok: {
    marginTop: Spacing.three,
  },
});
