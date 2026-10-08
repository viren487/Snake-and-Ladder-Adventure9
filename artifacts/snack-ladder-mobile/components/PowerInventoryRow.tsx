import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PowerGlyph } from '@/components/PowerGlyph';

export type PowerInventory = {
  bomb: number;
  antiVenom: number;
  defuser: number;
  webShooter: number;
  knife: number;
  extraDice: number;
};

const ITEMS = [
  { key: 'bomb', label: 'Bomb', short: 'BOMB', glyph: 'bomb', background: '#c54d58', border: '#ffc08d' },
  { key: 'antiVenom', label: 'Anti-Venom', short: 'VENOM', glyph: 'antiVenom', background: '#187a31', border: '#a8f6a1' },
  { key: 'defuser', label: 'Defuser Kit', short: 'DEFUSE', glyph: 'defuser', background: '#4253ae', border: '#a9c5ff' },
  { key: 'webShooter', label: 'Web Shooter', short: 'WEB', glyph: 'webShooter', background: '#2579ad', border: '#a9f1ff' },
  { key: 'knife', label: 'Knife', short: 'KNIFE', glyph: 'knife', background: '#7449ac', border: '#dfb4ff' },
  { key: 'extraDice', label: 'Extra Dice', short: 'DICE', glyph: 'dice-multiple', background: '#c47735', border: '#ffe59d' },
] as const;

export function PowerInventoryRow({
  powers,
  selected = null,
  onSelect,
  disabled = false,
  centerControl,
}: {
  powers: PowerInventory;
  selected?: keyof PowerInventory | null;
  onSelect?: (power: keyof PowerInventory) => void;
  disabled?: boolean;
  centerControl?: React.ReactNode;
}) {
  return (
    <View style={styles.row} accessibilityLabel="Current power counts">
      {ITEMS.map((item, index) => {
        const count = powers[item.key];
        const zero = count === 0;
        const isSelected = selected === item.key;
        return (
          <React.Fragment key={item.key}>
            {index === 3 && centerControl && <View style={styles.centerControl}>{centerControl}</View>}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.label}: ${count}${isSelected ? ', details open' : ''}`}
              accessibilityState={{ selected: isSelected, disabled }}
              testID={`power-inventory-${item.key}`}
              onPress={() => onSelect?.(item.key)}
              disabled={disabled || !onSelect}
              style={({ pressed }) => [styles.item, { opacity: disabled ? 0.5 : pressed ? 0.76 : 1 }]}
            >
              <View style={[
                styles.tile,
                {
                  backgroundColor: item.background,
                  borderColor: isSelected ? '#fff0a3' : item.border,
                  borderWidth: isSelected ? 2.5 : 1,
                  transform: [{ scale: isSelected ? 1.06 : 1 }],
                },
              ]}>
                {item.glyph === 'dice-multiple'
                  ? <MaterialCommunityIcons name="dice-multiple" size={24} color="#fff9e7" />
                  : <PowerGlyph power={item.glyph} size={27} />}
                <View style={[styles.badge, { backgroundColor: zero ? '#4a5266' : '#f3c35b' }]}>
                  <Text style={[styles.badgeText, { color: zero ? '#d6dbe6' : '#402b1d' }]}>{count}</Text>
                </View>
              </View>
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5, paddingHorizontal: 3 },
  item: { flex: 1, minWidth: 0, alignItems: 'center' },
  centerControl: { width: 64, height: 64, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  tile: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 13, shadowColor: '#100b18', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 3 },
  badge: { position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, paddingHorizontal: 3, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#171b2c' },
  badgeText: { fontFamily: 'monospace', fontSize: 9, lineHeight: 11, fontWeight: '700', textAlign: 'center' },
});
