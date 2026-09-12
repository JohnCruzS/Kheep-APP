import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Spacing } from '@/constants/theme';

type Option = { id: string; label: string };

/**
 * Campo que se ve como un TextField normal (línea inferior, mismo tipo de
 * letra) pero al tocarlo despliega una fila de opciones — usado para
 * Comuna/Categoría tanto al crear como al editar una publicación o el
 * perfil del comercio, para que las tres pantallas se sientan iguales.
 */
export function PickerField({
  label,
  value,
  open,
  onToggle,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  options: Option[];
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.container}>
      <Pressable onPress={onToggle} style={styles.row}>
        <Text style={value ? styles.value : styles.placeholder}>{value || label}</Text>
        <Text style={styles.chevron}>{open ? '︿' : '﹀'}</Text>
      </Pressable>

      {open && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options}>
          {options.map((option) => (
            <Pressable key={option.id} onPress={() => onSelect(option.id)} style={styles.option}>
              <Text style={styles.optionLabel}>{option.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.inputBorder,
    paddingBottom: Spacing.two,
  },
  value: {
    fontFamily: Fonts.light,
    fontSize: 16,
    color: Colors.cardText,
  },
  placeholder: {
    fontFamily: Fonts.light,
    fontSize: 16,
    color: Colors.placeholder,
  },
  chevron: {
    fontFamily: Fonts.light,
    color: Colors.textMuted,
  },
  options: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  option: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F1F1F1',
  },
  optionLabel: {
    fontFamily: Fonts.medium,
    fontSize: 12.5,
    color: Colors.cardText,
  },
});
