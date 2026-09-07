import { memo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import type { Comuna } from '@/lib/catalog';

type Props = {
  comunas: Comuna[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

/**
 * "Filtro Geográfico Hiperlocal" del plan: selector de comuna en la barra
 * superior que adapta la vitrina al instante. Vive junto al logo porque es
 * lo primero que define qué ve cada comprador — antes de categoría o
 * búsqueda.
 */
function ComunaPickerComponent({ comunas, selectedId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const label = comunas.find((c) => c.id === selectedId)?.nombre ?? 'Todas las comunas';

  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={8} style={styles.trigger}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.chevron}>﹀</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Elige tu comuna</Text>

            <Option
              label="Todas las comunas"
              active={selectedId === null}
              onPress={() => {
                onSelect(null);
                setOpen(false);
              }}
            />
            {comunas.map((comuna) => (
              <Option
                key={comuna.id}
                label={comuna.nombre}
                active={selectedId === comuna.id}
                onPress={() => {
                  onSelect(comuna.id);
                  setOpen(false);
                }}
              />
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export const ComunaPicker = memo(ComunaPickerComponent);

function Option({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.option}>
      <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{label}</Text>
      {active && <Text style={styles.check}>✓</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  label: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  chevron: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.backgroundAlt,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
  },
  sheetTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: Colors.textMuted,
    marginBottom: Spacing.three,
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  optionLabel: {
    fontSize: 15,
    color: Colors.text,
  },
  optionLabelActive: {
    color: Colors.accent,
    fontWeight: '700',
  },
  check: {
    color: Colors.accent,
    fontWeight: '700',
  },
});
