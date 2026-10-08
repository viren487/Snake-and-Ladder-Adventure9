import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PowerGlyph } from '@/components/PowerGlyph';
import { useColors } from '@/hooks/useColors';

export type PowerInventory = {
  bomb: number;
  antiVenom: number;
  defuser: number;
  webShooter: number;
  knife: number;
  extraDice: number;
};

const ITEMS = [
  { key: 'bomb', label: 'Bomb', glyph: 'bomb', color: 'powerBomb', highlight: 'powerBombHighlight', border: 'powerBombBorder' },
  { key: 'antiVenom', label: 'Anti-Venom', glyph: 'antiVenom', color: 'powerAntiVenom', highlight: 'powerAntiVenomHighlight', border: 'powerAntiVenomBorder' },
  { key: 'defuser', label: 'Defuser Kit', glyph: 'defuser', color: 'powerDefuser', highlight: 'powerDefuserHighlight', border: 'powerDefuserBorder' },
  { key: 'webShooter', label: 'Web Shooter', glyph: 'webShooter', color: 'powerWebShooter', highlight: 'powerWebShooterHighlight', border: 'powerWebShooterBorder' },
  { key: 'knife', label: 'Knife', glyph: 'knife', color: 'powerKnife', highlight: 'powerKnifeHighlight', border: 'powerKnifeBorder' },
  { key: 'extraDice', label: 'Extra Dice', glyph: 'dice-multiple', color: 'powerExtraDice', highlight: 'powerExtraDiceHighlight', border: 'powerExtraDiceBorder' },
] as const;

type PowerKey = keyof PowerInventory;
type PaletteKey = typeof ITEMS[number]['color'] | typeof ITEMS[number]['highlight'] | typeof ITEMS[number]['border'] | 'powerBombList' | 'powerBombListHighlight' | 'powerBombListBorder';
type BombSummary = { id: string; square: number; ownerName: string; owned: boolean; ready: boolean };
type SlotKey = PowerKey | 'bombList' | null;

const TOP_ROW: SlotKey[] = ['bomb', 'antiVenom', null, null, 'defuser', 'webShooter'];
const BOTTOM_ROW: SlotKey[] = ['extraDice', null, null, null, 'knife', 'bombList'];

export function PowerInventoryRow({
  powers,
  selected = null,
  onSelect,
  disabled = false,
  centerControl,
  bombs = [],
}: {
  powers: PowerInventory;
  selected?: PowerKey | null;
  onSelect?: (power: PowerKey) => void;
  disabled?: boolean;
  centerControl?: React.ReactNode;
  bombs?: BombSummary[];
}) {
  const colors = useColors();
  const [bombListOpen, setBombListOpen] = React.useState(false);
  const itemByKey = new Map(ITEMS.map((item) => [item.key, item]));
  const renderSlot = (key: SlotKey, index: number) => {
    if (key === 'bombList') {
      if (bombs.length === 0) return <View key={`empty-${index}`} style={styles.slot} />;
      return (
        <View key="bomb-list" style={styles.slot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Planted bombs: ${bombs.length}`}
            accessibilityState={{ expanded: bombListOpen }}
            onPress={() => setBombListOpen((open) => !open)}
            style={({ pressed }) => [styles.item, { opacity: pressed ? 0.76 : 1 }]}
            testID="planted-bombs-toggle"
          >
            <LinearGradient colors={[colors.powerBombListHighlight, colors.powerBombList]} style={[styles.tile, { borderColor: colors.powerBombListBorder }]}>
              <MaterialCommunityIcons name="format-list-bulleted" size={20} color="#f8f4ff" />
            </LinearGradient>
          </Pressable>
        </View>
      );
    }
    if (!key || (key === 'extraDice' && powers.extraDice === 0)) {
      return <View key={`empty-${index}`} style={styles.slot} />;
    }
    const item = itemByKey.get(key);
    if (!item) return <View key={`empty-${index}`} style={styles.slot} />;
    const count = powers[item.key];
    const zero = count === 0;
    const isSelected = selected === item.key;
    return (
      <View key={item.key} style={styles.slot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.label}: ${count}${isSelected ? ', details open' : ''}`}
          accessibilityState={{ selected: isSelected, disabled }}
          testID={`power-inventory-${item.key}`}
          onPress={() => onSelect?.(item.key)}
          disabled={disabled || !onSelect}
          style={({ pressed }) => [styles.item, { opacity: disabled ? 0.72 : pressed ? 0.76 : 1 }]}
        >
          <LinearGradient
            colors={[colors[item.highlight as PaletteKey], colors[item.color as PaletteKey]]}
            style={[
              styles.tile,
              {
                borderColor: isSelected ? '#fff0a3' : colors[item.border as PaletteKey],
                borderWidth: isSelected ? 2.5 : 1,
                transform: [{ scale: isSelected ? 1.06 : 1 }],
              },
            ]}
          >
            {item.glyph === 'dice-multiple'
              ? <MaterialCommunityIcons name="dice-multiple" size={20} color="#fff9e7" />
              : <PowerGlyph power={item.glyph} size={27} />}
            <View style={[styles.badge, { backgroundColor: zero ? colors.powerZeroCount : colors.powerCount }]}>
              <Text style={[styles.badgeText, { color: zero ? colors.powerZeroCountText : colors.powerCountText }]}>{count}</Text>
            </View>
          </LinearGradient>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.row} accessibilityLabel="Current power counts">
      <View style={styles.gridRow}>{TOP_ROW.map(renderSlot)}</View>
      <View style={styles.gridRow}>{BOTTOM_ROW.map(renderSlot)}</View>
      {centerControl && <View pointerEvents="box-none" style={styles.centerControl}>{centerControl}</View>}
      {bombListOpen && bombs.length > 0 && (
        <View style={[styles.bombList, { backgroundColor: colors.card, borderColor: colors.border }]} testID="planted-bombs-list">
          <Text style={[styles.bombListTitle, { color: colors.foreground }]}>Planted bombs</Text>
          {bombs.map((bomb) => (
            <Text key={bomb.id} style={[styles.bombListRow, { color: colors.mutedForeground }]}>
              House {bomb.square} · {bomb.owned ? bomb.ready ? 'yours, ready to detonate' : 'yours, waiting for a rival' : bomb.ownerName}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', height: 88, position: 'relative', justifyContent: 'space-between', paddingHorizontal: 1 },
  gridRow: { height: 42, width: '100%', flexDirection: 'row', alignItems: 'center' },
  slot: { width: '16.6667%', height: 42, alignItems: 'center', justifyContent: 'center' },
  item: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  centerControl: { position: 'absolute', left: '50%', top: 0, width: 64, height: 64, alignItems: 'center', justifyContent: 'center', zIndex: 9, transform: [{ translateX: -32 }] },
  tile: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 13, shadowColor: '#100b18', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 3 },
  badge: { position: 'absolute', top: -5, right: -5, minWidth: 18, height: 17, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#171b2c' },
  badgeText: { fontFamily: 'monospace', fontSize: 9, lineHeight: 11, fontWeight: '700', textAlign: 'center' },
  bombList: { position: 'absolute', left: 4, right: 4, top: 91, zIndex: 12, padding: 9, borderWidth: 1, borderRadius: 10, gap: 4 },
  bombListTitle: { fontFamily: 'Fredoka_600SemiBold', fontSize: 12 },
  bombListRow: { fontFamily: 'monospace', fontSize: 9, lineHeight: 13 },
});
