import React from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Ellipse, Image as SvgImage, Path } from 'react-native-svg';
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { GameState, MysteryPowerType, ShootableSnakeSquare } from '@workspace/game-core';
import { BOOM_SQUARE, BULLET_PICKUP_SQUARES, GUN_SQUARES, KEY_SQUARES, LADDERS, MYSTERY_BOX_SQUARES, SNAKES, SHOOTABLE_SNAKE_SQUARES, squareAt } from '@workspace/game-core';
import { useColors } from '@/hooks/useColors';
import { PowerGlyph } from '@/components/PowerGlyph';

export type BoardBlast = {
  id: number;
  sourceSquare: number;
  victims: { playerId: string; fromSquare: number }[];
};

export type BoardMotion = {
  id: number;
  playerId: string;
  playerIds?: string[];
  position: number;
  effect: 'step' | 'ladder' | 'snake' | 'boom' | 'torch' | 'return' | 'bamboo' | 'web' | 'knife';
  sourcePosition?: number;
  carriedItem?: 'torch' | 'key' | null;
};

export type BoardShot = { id: number; from: number; targets: readonly ShootableSnakeSquare[] };
export type BoardPickupNotice = { id: number; kind: 'torch' | 'key'; playerName: string; room?: number };

type Props = {
  game: GameState;
  walking?: BoardMotion | null;
  shot?: BoardShot | null;
  firing?: boolean;
  pickupNotice?: BoardPickupNotice | null;
  selectedTargets?: readonly ShootableSnakeSquare[];
  onSelectTarget?: (square: ShootableSnakeSquare) => void;
  bombBlast?: BoardBlast | null;
  mysterySquare?: number | null;
  mysteryCanChoose?: boolean;
  mysteryBusy?: boolean;
  onChooseMystery?: (power: MysteryPowerType) => void;
};

function useReducedMotionSetting() {
  const [reduceMotion, setReduceMotion] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduceMotion(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduceMotion;
}

const MYSTERY_POWER_OPTIONS: {
  power: MysteryPowerType;
  label: string;
  blurb: string;
}[] = [
  { power: 'bomb', label: 'Bomb', blurb: 'Plant in your current room' },
  { power: 'antiVenom', label: 'Anti-Venom', blurb: 'Blocks one snake bite' },
  { power: 'defuser', label: 'Defuser Kit', blurb: 'Disarms one bomb' },
  { power: 'webShooter', label: 'Web Shooter', blurb: 'Pull a rival back three rooms' },
  { power: 'knife', label: 'Knife', blurb: 'Strikes a rival in your room' },
];

function MysteryPowerTray({
  square,
  boardSize,
  canChoose,
  busy,
  onChoose,
}: {
  square: number;
  boardSize: number;
  canChoose: boolean;
  busy: boolean;
  onChoose?: (power: MysteryPowerType) => void;
}) {
  const colors = useColors();
  const [selected, setSelected] = React.useState<MysteryPowerType | null>(null);
  React.useEffect(() => { setSelected(null); }, [square]);
  const labelSize = Math.max(7, Math.min(10, boardSize / 44));
  const iconSize = Math.min(26, Math.max(18, Math.round(boardSize / 14)));
  const accents: Record<MysteryPowerType, string> = {
    bomb: '#ffad78',
    antiVenom: '#9cf28c',
    defuser: '#a9c5ff',
    webShooter: '#9defff',
    knife: '#dcb5ff',
  };

  return (
    <View style={[styles.mysteryTray, { backgroundColor: colors.boardDark, borderColor: colors.boardFrameLight }]} testID="mystery-power-tray">
      <Text style={[styles.mysteryTrayTitle, { color: colors.primary, fontSize: labelSize, lineHeight: labelSize + 1 }]}>
        {canChoose ? `BOX ${square} · CHOOSE ONE` : `BOX ${square} · WAITING`}
      </Text>
      <View style={styles.mysteryPowerGrid}>
        {MYSTERY_POWER_OPTIONS.map((option) => {
          const isSelected = selected === option.power;
          return (
            <View key={option.power} style={styles.mysteryPowerSlot}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Choose ${option.label}`}
                accessibilityHint={option.blurb}
                accessibilityState={{ selected: isSelected, disabled: !canChoose || busy }}
                disabled={!canChoose || busy}
                onPress={() => setSelected(option.power)}
                style={[
                  styles.mysteryPowerOption,
                  { backgroundColor: isSelected ? colors.primary : colors.card, borderColor: isSelected ? colors.accent : accents[option.power] },
                ]}
                testID={`mystery-option-${option.power}`}
              >
                <PowerGlyph power={option.power} size={iconSize} />
                <Text style={[styles.mysteryPowerLabel, { color: isSelected ? colors.primaryForeground : colors.foreground, fontSize: labelSize, lineHeight: labelSize }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {option.label}
                </Text>
              </Pressable>
              {isSelected && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Get ${option.label}`}
                  disabled={!canChoose || busy}
                  onPress={() => onChoose?.(option.power)}
                  style={[styles.mysteryGetButton, { backgroundColor: colors.primary, height: Math.max(10, labelSize + 3) }]}
                  testID="get-mystery-power"
                >
                  <Text style={[styles.mysteryGetLabel, { color: colors.primaryForeground, fontSize: Math.max(6.5, labelSize - 1) }]}>GET</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function centerForSquare(square: number) {
  for (let row = 0; row < 10; row += 1) {
    for (let column = 0; column < 10; column += 1) {
      if (squareAt(row, column) === square) {
        return { x: column * 100 + 50, y: row * 100 + 50, row, column };
      }
    }
  }
  return { x: 50, y: 950, row: 9, column: 0 };
}

type TileFeature = 'bullet' | 'mystery' | 'gun' | 'bomb' | 'crown';

const TILE_FEATURE_LABELS: Record<TileFeature, string> = {
  bullet: 'bullet pickup',
  mystery: 'mystery box',
  gun: 'gun room',
  bomb: 'bomb trap',
  crown: 'crown',
};

const SNAKE_ARTWORK = {
  blue: require('../assets/images/realistic-snake-blue.png'),
  green: require('../assets/images/realistic-snake-green.png'),
  orange: require('../assets/images/realistic-snake-orange.png'),
  red: require('../assets/images/realistic-snake-red.png'),
  violet: require('../assets/images/realistic-snake-violet.png'),
};

function tileFeature(square: number): TileFeature | null {
  if ((BULLET_PICKUP_SQUARES as readonly number[]).includes(square)) return 'bullet';
  if ((MYSTERY_BOX_SQUARES as readonly number[]).includes(square)) return 'mystery';
  if ((GUN_SQUARES as readonly number[]).includes(square)) return 'gun';
  if (square === BOOM_SQUARE) return 'bomb';
  if (square === 100) return 'crown';
  return null;
}

function TileFeatureIcon({ feature }: { feature: TileFeature }) {
  if (feature === 'bullet') {
    return (
      <Svg width="100%" height="100%" viewBox="0 0 48 48">
        <Path d="M24 5C18 12 14 18 14 25v8h20v-8C34 18 30 12 24 5Z" fill="#dce6e9" stroke="#59401d" strokeWidth={2.5} />
        <Path d="M14 27h20v8H14z" fill="#e3a934" stroke="#59401d" strokeWidth={2} />
        <Path d="M16 31h16" stroke="#fff0ad" strokeWidth={2} strokeLinecap="round" />
        <Path d="M21 14c1-2 2-4 3-5" stroke="#fff" strokeWidth={2} strokeLinecap="round" opacity={0.8} />
      </Svg>
    );
  }
  if (feature === 'mystery') {
    return (
      <Svg width="100%" height="100%" viewBox="0 0 56 56">
        <Path d="M7 18 28 7l21 11-21 12Z" fill="#f5c85b" stroke="#53351e" strokeWidth={2.2} strokeLinejoin="round" />
        <Path d="M7 18 28 30v21L7 39Z" fill="#a34e9d" stroke="#53351e" strokeWidth={2.2} strokeLinejoin="round" />
        <Path d="M49 18 28 30v21l21-12Z" fill="#633b91" stroke="#3a2852" strokeWidth={2.2} strokeLinejoin="round" />
        <Path d="M25 9 30 11v38l-5 2Z" fill="#f4d374" opacity={0.94} />
        <Path d="M8 18 28 29l20-11" fill="none" stroke="#ffe6a1" strokeWidth={2} />
        <Path d="M34 28q4-6 9-1 3 4-2 8l-4 3v2" fill="none" stroke="#fff0a7" strokeWidth={3} strokeLinecap="round" />
        <Circle cx={37} cy={46} r={1.8} fill="#fff0a7" />
      </Svg>
    );
  }
  if (feature === 'gun') {
    return (
      <Svg width="100%" height="100%" viewBox="0 0 64 48">
        <Path d="M8 22.5h34l-4.4 5.1h-5.2L29.5 41q-.5 2-2.6 2h-8.2l2.6-13.1-8-2.5H9.8q-2.2 0-2.7-2.4Z" fill="#727b80" stroke="#242a2d" strokeWidth={1.25} strokeLinejoin="round" />
        <Path d="m21.3 29.2 9.4.2-2.7 10.8q-.4 1.8-2.4 1.8h-7.2Z" fill="#342d29" stroke="#1f1c1a" strokeWidth={1} strokeLinejoin="round" />
        <Path d="m22.5 31 5.7.1-2.1 8.4h-5.3Z" fill="#59483b" />
        <Path d="M5.5 12.3q0-3.5 3.7-3.5h32.5l15 4.7 4.3 2.7v7.1H39.8l-3.5 4H10.5q-3.1 0-3.7-3Z" fill="#414c55" stroke="#1f262b" strokeWidth={1.35} strokeLinejoin="round" />
        <Path d="M9.5 11.3h30.8l12.4 3.8H13.1q-2.4 0-3.6 1.2Z" fill="#aab4b8" opacity={0.65} />
        <Path d="M30.1 14h7.2v5.2h-7.2z" fill="#20272a" stroke="#9ca6a8" strokeWidth={0.65} />
        <Path d="M14 8.7V6.8h4.8v1.9m23.6.3V7.1h4.1v3.1m-34.9 3v9m3-8.7v9m3-8.7v9" fill="none" stroke="#c2c8c6" strokeWidth={0.8} strokeLinecap="round" />
      </Svg>
    );
  }
  if (feature === 'bomb') {
    return (
      <Svg width="100%" height="100%" viewBox="0 0 64 64">
        <Circle cx={29} cy={39} r={19} fill="#292a2f" stroke="#101115" strokeWidth={2.5} />
        <Circle cx={21} cy={29} r={5} fill="#8a8d91" opacity={0.55} />
        <Path d="M42 25 49 16M47 17q1-7 7-8" fill="none" stroke="#765338" strokeWidth={4} strokeLinecap="round" />
        <Path d="m55 3 1.6 4.2L61 9l-4 2.2-.5 4.6-3-3.2-4.4 1.2 2.4-3.9-2.4-3.9 4.5 1z" fill="#ffd34e" stroke="#e77b28" strokeWidth={1.4} strokeLinejoin="round" />
      </Svg>
    );
  }
  const icon = 'crown';
  return <MaterialCommunityIcons name={icon} size={15} color="#fff4d2" />;
}

function tokenColor(color: string, colors: ReturnType<typeof useColors>) {
  switch (color) {
    case 'coral': return colors.tokenCoral;
    case 'green': return colors.tokenGreen;
    case 'purple': return colors.tokenPurple;
    default: return colors.tokenBlue;
  }
}

function CarriedItem({ kind }: { kind: 'torch' | 'key' }) {
  const reduceMotion = useReducedMotionSetting();
  const scale = useSharedValue(0.45);
  React.useEffect(() => {
    if (reduceMotion) {
      scale.value = 1;
      return;
    }
    scale.value = withSequence(
      withTiming(1.2, { duration: 150, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 130, easing: Easing.out(Easing.cubic) }),
    );
  }, [kind, reduceMotion, scale]);
  const motionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scale.value, [0.45, 0.8, 1], [0, 1, 1]),
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={[styles.carriedItem, motionStyle]} pointerEvents="none" testID={`carried-${kind}`}>
      <MaterialCommunityIcons
        name={kind === 'torch' ? 'flashlight' : 'key-variant'}
        size={kind === 'torch' ? 16 : 15}
        color={kind === 'torch' ? '#ffe49b' : '#ffd35b'}
      />
    </Animated.View>
  );
}

function PandaToken({ color, carriedItem }: { color: string; carriedItem?: 'torch' | 'key' | null }) {
  const colors = useColors();
  const scarf = tokenColor(color, colors);
  const scarfShade = color === 'blue' ? '#0879ad' : color === 'coral' ? '#c44839' : color === 'green' ? '#168353' : '#714cba';
  return (
    <View style={styles.tokenWrap}>
      <Svg width={27} height={33} viewBox="0 0 52 62" aria-hidden={true}>
        <Ellipse cx={26} cy={57} rx={14} ry={3} fill="#10151b" opacity={0.4} />
        <Ellipse cx={26} cy={47} rx={15} ry={11} fill={scarf} stroke="#473523" strokeWidth={1.5} />
        <Path d="M13 44q13 8 26 0v6q-13 9-26 0Z" fill={scarfShade} />
        <Path d="m35 48 8 5-7 3-4-7Z" fill={scarf} stroke="#473523" strokeWidth={1} strokeLinejoin="round" />
        <Circle cx={12} cy={17} r={8} fill="#24252a" />
        <Circle cx={40} cy={17} r={8} fill="#24252a" />
        <Circle cx={12} cy={17} r={3.2} fill="#efb7ad" />
        <Circle cx={40} cy={17} r={3.2} fill="#efb7ad" />
        <Path d="M8 28c0-12 7-20 18-20s18 8 18 20c0 11-7 18-18 18S8 39 8 28Z" fill="#fff7e8" stroke="#55412f" strokeWidth={1.5} />
        <Ellipse cx={17} cy={26} rx={5.6} ry={7.3} fill="#28282b" transform="rotate(18 17 26)" />
        <Ellipse cx={35} cy={26} rx={5.6} ry={7.3} fill="#28282b" transform="rotate(-18 35 26)" />
        <Circle cx={18.4} cy={25.8} r={2.3} fill="#fffdf5" />
        <Circle cx={33.6} cy={25.8} r={2.3} fill="#fffdf5" />
        <Circle cx={18.8} cy={26} r={1.3} fill="#18191c" />
        <Circle cx={33.2} cy={26} r={1.3} fill="#18191c" />
        <Ellipse cx={26} cy={34} rx={8.2} ry={5.7} fill="#fffdf5" stroke="#dfd5c5" strokeWidth={0.7} />
        <Path d="M23 32q3-2 6 0-1.5 3.2-3 3.2T23 32Z" fill="#352724" />
        <Path d="M26 35v2.2q-2.2 2.3-4.2.2m4.2-.2q2.2 2.3 4.2.2" fill="none" stroke="#43312a" strokeWidth={1.2} strokeLinecap="round" />
        <Circle cx={12} cy={35} r={2} fill="#ee9989" opacity={0.65} />
        <Circle cx={40} cy={35} r={2} fill="#ee9989" opacity={0.65} />
        <Path d="M20 44q6 2 12 0" fill="none" stroke="#fff9e9" strokeWidth={1.4} opacity={0.8} />
      </Svg>
      {carriedItem && <CarriedItem key={carriedItem} kind={carriedItem} />}
    </View>
  );
}

function AnimatedPawnSpot({
  position,
  boardSize,
  shift,
  effect,
  animationId,
  children,
}: {
  position: number;
  boardSize: number;
  shift: number;
  effect: BoardMotion['effect'];
  animationId: number;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotionSetting();
  const point = centerForSquare(position);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const ready = React.useRef(false);

  React.useEffect(() => {
    if (boardSize <= 0) return;
    const targetX = point.x / 1000 * boardSize - boardSize / 20;
    const targetY = point.y / 1000 * boardSize - boardSize / 20;
    if (!ready.current || reduceMotion) {
      x.value = targetX;
      y.value = targetY;
      ready.current = true;
      return;
    }
    const duration = effect === 'ladder' ? 2200
      : effect === 'snake' ? 2000
        : effect === 'boom' ? 2350
          : effect === 'web' ? 1450
            : effect === 'knife' ? 1250
              : 220;
    x.value = withTiming(targetX, { duration, easing: Easing.out(Easing.cubic) });
    y.value = withTiming(targetY, { duration, easing: Easing.out(Easing.cubic) });
  }, [animationId, boardSize, effect, point.x, point.y, reduceMotion, x, y]);

  const motionStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value + shift }, { translateY: y.value }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.pawnSpot, motionStyle]}>
      {children}
    </Animated.View>
  );
}

function ShotProjectile({
  target,
  source,
  boardSize,
  progress,
  shotId,
}: {
  target: ShootableSnakeSquare;
  source: { x: number; y: number };
  boardSize: number;
  progress: SharedValue<number>;
  shotId: number;
}) {
  const point = centerForSquare(target);
  const projectileStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.08, 0.82, 1], [0, 1, 1, 0]),
    transform: [
      { translateX: (point.x - source.x) / 1000 * boardSize * progress.value },
      { translateY: (point.y - source.y) / 1000 * boardSize * progress.value },
      { scale: interpolate(progress.value, [0, 0.2, 0.9, 1], [0.55, 1.05, 1, 0.25]) },
    ],
  }));
  return (
    <Animated.View
      key={`${shotId}-${target}`}
      pointerEvents="none"
      style={[styles.shotProjectile, { left: `${source.x / 10}%`, top: `${source.y / 10}%` }, projectileStyle]}
    />
  );
}

function ShotAnimation({ shot, boardSize, firing }: { shot: BoardShot; boardSize: number; firing: boolean }) {
  const progress = useSharedValue(0);
  const source = centerForSquare(shot.from);
  React.useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: 820, easing: Easing.out(Easing.cubic) });
  }, [progress, shot.id]);
  const muzzleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.12, 0.42, 1], [0, 1, 0.38, 0]),
    transform: [{ scale: interpolate(progress.value, [0, 0.12, 0.42, 1], [0.35, 1.35, 1, 0.7]) }],
  }));

  return (
    <>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 1000 1000" pointerEvents="none" aria-hidden={true}>
        {shot.targets.map((target) => {
          const point = centerForSquare(target);
          return (
            <React.Fragment key={target}>
              <Path d={`M ${source.x} ${source.y} L ${point.x} ${point.y}`} stroke="#201323" strokeWidth={22} opacity={0.72} />
              <Path d={`M ${source.x} ${source.y} L ${point.x} ${point.y}`} stroke="#ffe18a" strokeWidth={9} opacity={0.9} strokeDasharray="22 18" />
              <Circle cx={point.x} cy={point.y} r={34} fill="none" stroke="#ff3c45" strokeWidth={11} opacity={0.9} />
            </React.Fragment>
          );
        })}
      </Svg>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.shotMuzzle,
          { left: `${source.x / 10}%`, top: `${source.y / 10}%`, backgroundColor: firing ? '#fff2a8' : '#ffbe53' },
          muzzleStyle,
        ]}
      />
      {shot.targets.map((target) => (
        <ShotProjectile key={`${shot.id}-${target}`} target={target} source={source} boardSize={boardSize} progress={progress} shotId={shot.id} />
      ))}
    </>
  );
}

function PickupNoticeVisual({ notice }: { notice: BoardPickupNotice }) {
  const colors = useColors();
  const progress = useSharedValue(0);
  React.useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: 3200, easing: Easing.out(Easing.cubic) });
  }, [notice.id, progress]);
  const motionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.1, 0.84, 1], [0, 1, 1, 0]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [8, -8]) },
      { scale: interpolate(progress.value, [0, 0.12, 0.84, 1], [0.76, 1, 1, 0.94]) },
    ],
  }));
  const isKey = notice.kind === 'key';
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.pickupNotice, { borderColor: '#ffe184', backgroundColor: '#f2c45b', shadowColor: colors.boardDark }, motionStyle]}
      testID="pickup-notice"
    >
      <View style={styles.pickupNoticeIcon}>
        <MaterialCommunityIcons name={isKey ? 'key-variant' : 'flashlight'} size={27} color={isKey ? '#b97418' : '#a05c15'} />
      </View>
      <View style={styles.pickupNoticeCopy}>
        <Text style={styles.pickupNoticeTitle}>{isKey ? 'KEY FOUND' : 'TORCH CLAIMED'}</Text>
        <Text style={styles.pickupNoticeMessage}>
          {isKey ? `Room ${notice.room ?? ''} key secured. Return to 100 for the crown.` : `${notice.playerName} has the torch. Light the black rooms to find a key.`}
        </Text>
      </View>
      <MaterialCommunityIcons name="creation" size={20} color="#9c5b22" />
    </Animated.View>
  );
}

function DancingPanda({ player, index }: { player: GameState['players'][number]; index: number }) {
  const bounce = useSharedValue(0);
  const reduceMotion = useReducedMotionSetting();
  React.useEffect(() => {
    if (reduceMotion) {
      bounce.value = 0;
      return;
    }
    bounce.value = withDelay(index * 130, withRepeat(
      withSequence(
        withTiming(-8, { duration: 350, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 350, easing: Easing.inOut(Easing.cubic) }),
      ),
      -1,
      true,
    ));
  }, [bounce, index, reduceMotion]);
  const motionStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounce.value }, { rotate: `${bounce.value * -0.7}deg` }],
  }));
  return (
    <Animated.View style={motionStyle}>
      <PandaToken color={player.color} carriedItem={player.crownKeyRoom !== null ? 'key' : player.hasTorch ? 'torch' : null} />
    </Animated.View>
  );
}

function WinnerCelebration({ game }: { game: GameState }) {
  const winners = game.players.filter((player) => (game.winnerIds ?? [game.winnerId]).includes(player.id));
  const loser = game.players.find((player) => player.id === game.loserId);
  if (!game.winnerId) return null;
  return (
    <View pointerEvents="none" style={styles.celebrationBackdrop} testID="match-celebration">
      <View style={styles.celebrationCard}>
        <MaterialCommunityIcons name="crown" size={34} color="#ffd46b" />
        <Text style={styles.celebrationEyebrow}>QUEST COMPLETE</Text>
        <Text style={styles.celebrationTitle}>{winners.map((player) => player.name).join(' & ')}</Text>
        <Text style={styles.celebrationSubtitle}>claimed the crown!</Text>
        <View style={styles.celebrationPandas}>
          {winners.map((player, index) => <DancingPanda key={player.id} player={player} index={index} />)}
        </View>
        {loser && (
          <View style={styles.celebrationLoser}>
            <MaterialCommunityIcons name="emoticon-sad-outline" size={17} color="#d4c8d7" />
            <Text style={styles.celebrationLoserText}>{loser.name} finished last</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function HomecomingPanda({
  color,
  carriedItem,
  fromSquare,
  boardSize,
  delay,
  animationId,
  duration = 2350,
}: {
  color: string;
  carriedItem?: 'torch' | 'key' | null;
  fromSquare: number;
  boardSize: number;
  delay: number;
  animationId: number;
  duration?: number;
}) {
  const progress = useSharedValue(0);
  const from = centerForSquare(fromSquare);
  const home = { x: 70, y: 948 };

  React.useEffect(() => {
    if (boardSize <= 0) return;
    progress.value = 0;
    progress.value = withDelay(delay, withTiming(1, {
      duration,
      easing: Easing.out(Easing.cubic),
    }));
  }, [animationId, boardSize, delay, duration, progress]);

  const motionStyle = useAnimatedStyle(() => {
    const amount = progress.value;
    const sway = Math.sin(amount * Math.PI * 3) * boardSize * 0.018;
    return {
      opacity: interpolate(amount, [0, 0.8, 1], [1, 1, 0]),
      transform: [
        { translateX: ((from.x + (home.x - from.x) * amount) / 1000) * boardSize - 12 + sway },
        { translateY: ((from.y + (home.y - from.y) * amount) / 1000) * boardSize - 14 + sway * 0.55 },
        { rotate: `${amount * 1080}deg` },
        { scale: interpolate(amount, [0, 0.36, 0.76, 1], [1, 1.18, 1.04, 0.72]) },
      ],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.homecomingPanda, motionStyle]}>
      <PandaToken color={color} carriedItem={carriedItem} />
    </Animated.View>
  );
}

function BlastRing({
  progress,
  delay,
  color,
}: {
  progress: SharedValue<number>;
  delay: number;
  color: string;
}) {
  const ringStyle = useAnimatedStyle(() => {
    const amount = Math.max(0, Math.min(1, (progress.value - delay) / (1 - delay)));
    return {
      opacity: interpolate(amount, [0, 0.12, 0.72, 1], [0, 0.9, 0.42, 0]),
      transform: [{ scale: interpolate(amount, [0, 1], [0.25, 3.7]) }],
    };
  });

  return <Animated.View pointerEvents="none" style={[styles.blastRing, { borderColor: color }, ringStyle]} />;
}

function TorchRoomGlow() {
  const reduceMotion = useReducedMotionSetting();
  const progress = useSharedValue(0);
  React.useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withTiming(1, { duration: 1050, easing: Easing.out(Easing.cubic) });
  }, [progress, reduceMotion]);
  const lightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.34, 1], [0, 0.62, 0.16]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.08, 1.28]) }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.torchRoomGlow, lightStyle]}
    />
  );
}

function KeyPickupAnimation({ square }: { square: number }) {
  const reduceMotion = useReducedMotionSetting();
  const progress = useSharedValue(0);
  const { row, column } = centerForSquare(square);
  React.useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withTiming(1, { duration: 1050, easing: Easing.out(Easing.cubic) });
  }, [progress, reduceMotion, square]);
  const motionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.12, 0.72, 1], [0, 1, 1, 0]),
    transform: [
      { translateX: -17 },
      { translateY: -17 },
      { translateY: interpolate(progress.value, [0, 1], [5, -30]) },
      { scale: interpolate(progress.value, [0, 0.24, 1], [0.35, 1.2, 0.6]) },
      { rotate: `${interpolate(progress.value, [0, 0.5, 1], [-35, 9, 25])}deg` },
    ],
  }));
  if (reduceMotion) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.keyPickupAnimation, { left: `${column * 10 + 5}%`, top: `${row * 10 + 5}%` }, motionStyle]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="key-pickup-animation"
    >
      <MaterialCommunityIcons name="key-variant" size={27} color="#ffe080" />
      <MaterialCommunityIcons name="auto-fix" size={18} color="#fff9d9" style={styles.keyPickupSparkle} />
    </Animated.View>
  );
}

function BombBlastVisual({ blast }: { blast: BoardBlast }) {
  const colors = useColors();
  const progress = useSharedValue(0);
  const source = centerForSquare(blast.sourceSquare);
  const row = Math.floor(source.y / 100);
  const column = Math.floor(source.x / 100);
  const flashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.08, 0.2, 0.38, 1], [0, 0.48, 0.18, 0, 0]),
  }));
  const coreStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.12, 0.42, 0.8, 1], [0, 0.95, 0.55, 0.16, 0]),
    transform: [{ scale: interpolate(progress.value, [0, 0.16, 0.48, 1], [0.25, 1.2, 1.8, 2.6]) }],
  }));

  React.useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: 1250, easing: Easing.out(Easing.cubic) });
  }, [blast.id, progress]);

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.destructive }, flashStyle]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.blastCell,
          { left: `${column * 10}%`, top: `${row * 10}%` },
        ]}
      >
        <BlastRing progress={progress} delay={0} color={colors.destructive} />
        <BlastRing progress={progress} delay={0.16} color={colors.primary} />
        <BlastRing progress={progress} delay={0.31} color={colors.foreground} />
        <Animated.View style={[styles.blastCore, { backgroundColor: colors.destructive }, coreStyle]} />
      </View>
    </>
  );
}

export function GameBoard({
  game,
  walking = null,
  shot = null,
  firing = false,
  pickupNotice = null,
  selectedTargets = [],
  onSelectTarget,
  bombBlast = null,
  mysterySquare = null,
  mysteryCanChoose = false,
  mysteryBusy = false,
  onChooseMystery,
}: Props) {
  const colors = useColors();
  const [boardSize, setBoardSize] = React.useState(0);
  const [keyPickup, setKeyPickup] = React.useState<{ playerId: string; square: number } | null>(null);
  const previousKeyRooms = React.useRef(new Map(game.players.map((player) => [player.id, player.crownKeyRoom])));
  React.useEffect(() => {
    let newlyCollected: { playerId: string; square: number } | null = null;
    const nextKeyRooms = new Map<string, number | null>();
    game.players.forEach((player) => {
      const previous = previousKeyRooms.current.get(player.id);
      if (newlyCollected === null && previous === null && player.crownKeyRoom !== null) {
        newlyCollected = { playerId: player.id, square: player.crownKeyRoom };
      }
      nextKeyRooms.set(player.id, player.crownKeyRoom);
    });
    previousKeyRooms.current = nextKeyRooms;
    if (newlyCollected) setKeyPickup(newlyCollected);
  }, [game.players]);
  React.useEffect(() => {
    if (!keyPickup) return;
    const timer = setTimeout(() => setKeyPickup(null), 1200);
    return () => clearTimeout(timer);
  }, [keyPickup]);
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));
  React.useEffect(() => {
    if (!bombBlast) return;
    shake.value = 0;
    shake.value = withSequence(
      withTiming(-6, { duration: 45 }),
      withTiming(7, { duration: 55 }),
      withTiming(-5, { duration: 55 }),
      withTiming(3, { duration: 65 }),
      withTiming(0, { duration: 110 }),
    );
  }, [bombBlast?.id, shake]);
  const cells = Array.from({ length: 100 }, (_, index) => {
    const row = Math.floor(index / 10);
    const column = index % 10;
    return { row, column, square: squareAt(row, column) };
  });

  const snakePaths = SNAKES.map((snake) => {
    const start = centerForSquare(snake.from);
    const end = centerForSquare(snake.to);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    const width = Math.min(72, Math.max(42, length * 0.12));
    const rotation = Math.atan2(-dx, dy) * 180 / Math.PI;
    return { ...snake, start, width, length, rotation, artwork: SNAKE_ARTWORK[snake.color] };
  });

  const ladderPaths = LADDERS.map((ladder) => {
    const start = centerForSquare(ladder.from);
    const end = centerForSquare(ladder.to);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const offsetX = (dy / length) * 10;
    const offsetY = (-dx / length) * 10;
    const rungs = Array.from({ length: 5 }, (_, index) => {
      const fraction = (index + 1) / 6;
      const x = start.x + dx * fraction;
      const y = start.y + dy * fraction;
      return `M ${x - offsetX} ${y - offsetY} L ${x + offsetX} ${y + offsetY}`;
    }).join(' ');
    return {
      ...ladder,
      rails: `M ${start.x - offsetX} ${start.y - offsetY} L ${end.x - offsetX} ${end.y - offsetY} M ${start.x + offsetX} ${start.y + offsetY} L ${end.x + offsetX} ${end.y + offsetY}`,
      rungs,
    };
  });

  return (
    <View
      style={[
        styles.frame,
        {
          backgroundColor: colors.boardFrame,
          borderColor: colors.boardFrameLight,
          shadowColor: colors.boardDark,
        },
      ]}
      accessibilityLabel="Snake and ladder game board"
      testID="game-board"
    >
      <LinearGradient
        pointerEvents="none"
        colors={['#fff0b2', '#bf7622', '#754116', '#e9a33a', '#70401c', '#e7a039', '#a85d18', '#f2c05c', '#6d421e']}
        locations={[0, 0.08, 0.11, 0.15, 0.18, 0.5, 0.84, 0.94, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.frameGradient}
      />
      <View pointerEvents="none" style={styles.frameInset} />
      <Animated.View
        onLayout={(event) => {
          const size = Math.min(event.nativeEvent.layout.width, event.nativeEvent.layout.height);
          setBoardSize((previous) => previous === size ? previous : size);
        }}
        style={[styles.inner, { borderColor: colors.boardFrameDark, backgroundColor: colors.boardGreen }, shakeStyle]}
      >
        <View style={styles.grid}>
          {cells.map(({ row, column, square }) => {
            const locked = (KEY_SQUARES as readonly number[]).includes(square);
            const feature = tileFeature(square);
            const bullet = feature === 'bullet';
            const tone: [string, string, string] = locked
              ? [colors.boardDark, colors.boardDark, colors.boardDark]
              : feature === 'crown'
                ? ['#f4bf36', '#c85d16', '#9c4217']
                : bullet
                ? [colors.boardBulletHighlight, colors.boardBulletShadow, colors.boardBulletShadow]
                : square % 3 === 0
                  ? [colors.boardBlueHighlight, colors.boardBlue, colors.boardBlueShadow]
                  : (row + column) % 2 === 0
                    ? [colors.boardGreenHighlight, colors.boardGreen, colors.boardGreenShadow]
                    : [colors.boardCreamHighlight, colors.boardCream, colors.boardCreamShadow];
            const backgroundColor = tone[0];
            const isSnakeTarget = (SHOOTABLE_SNAKE_SQUARES as readonly number[]).includes(square);
            const targetAvailable = isSnakeTarget && game.players[game.currentPlayerIndex]?.snakeStuns[square as ShootableSnakeSquare] === 0;
            const accessibleTarget = targetAvailable && !!onSelectTarget;
            const selected = selectedTargets.includes(square as ShootableSnakeSquare);
            const roomCarrier = locked
              ? game.players.find((player) =>
                (player.hasTorch || player.crownKeyRoom === square) && player.position === square
              )
              : undefined;
            const roomLit = !!roomCarrier;
            const keyVisible = roomLit && roomCarrier?.hasTorch === true && roomCarrier.crownKeyRoom === null;
            return (
              <Pressable
                key={square}
                accessibilityRole={accessibleTarget ? 'button' : undefined}
                accessibilityLabel={accessibleTarget ? `Aim at snake ${square}${selected ? ', selected' : ''}` : `Square ${square}${feature ? `, ${TILE_FEATURE_LABELS[feature]}` : ''}${locked ? roomLit ? keyVisible ? ', torch-lit; key revealed' : roomCarrier?.crownKeyRoom === square ? ', black room remains lit after key pickup' : ', black room lit by torch' : ', black room; number visible' : ''}`}
                accessibilityState={accessibleTarget ? { selected } : undefined}
                disabled={!accessibleTarget}
                onPress={() => onSelectTarget?.(square as ShootableSnakeSquare)}
                style={[
                  styles.cell,
                  { backgroundColor, borderColor: locked ? colors.boardDarkBorder : feature === 'crown' ? '#ffe578' : colors.transparentBorder },
                  feature === 'crown' && styles.crownCell,
                  accessibleTarget && styles.targetCell,
                ]}
              >
                <LinearGradient
                  colors={tone}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cellBackground}
                >
                  {roomLit && <TorchRoomGlow key={`room-light-${square}`} />}
                  <Text style={[styles.squareNumber, feature === 'crown' && styles.crownNumber, locked && styles.lockedRoomNumber, { color: locked ? colors.foreground : bullet || feature === 'crown' ? colors.boardSpecialForeground : colors.boardInk }]}>
                    {square}
                  </Text>
                  {keyVisible && (
                    <View style={styles.keyRoomMarker} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      <MaterialCommunityIcons name="key-variant" size={12} color="#fff0a3" />
                    </View>
                  )}
                  {feature && (
                    <View style={[styles.featureBadge, feature === 'crown' && styles.crownFeature, { backgroundColor: 'transparent', borderColor: 'transparent' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      <TileFeatureIcon feature={feature} />
                    </View>
                  )}
                </LinearGradient>
              </Pressable>
            );
          })}
        </View>

        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 1000 1000" pointerEvents="none">
          {ladderPaths.map((ladder) => (
            <React.Fragment key={`ladder-${ladder.from}`}>
              <Path d={ladder.rails} stroke="#4d2915" strokeWidth={23} strokeLinecap="round" fill="none" opacity={0.55} />
              <Path d={ladder.rails} stroke={colors.ladderInk} strokeWidth={17} strokeLinecap="round" fill="none" />
              <Path d={ladder.rails} stroke="#dc8731" strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.92} />
              <Path d={ladder.rungs} stroke="#71380f" strokeWidth={9} strokeLinecap="round" fill="none" />
              <Path d={ladder.rungs} stroke="#f0ad52" strokeWidth={3} strokeLinecap="round" fill="none" />
            </React.Fragment>
          ))}
          {snakePaths.map((snake, index) => (
            <React.Fragment key={`snake-${snake.from}`}>
              <SvgImage
                href={snake.artwork}
                x={snake.start.x - snake.width / 2}
                y={snake.start.y}
                width={snake.width}
                height={snake.length}
                preserveAspectRatio="none"
                transform={`rotate(${snake.rotation} ${snake.start.x} ${snake.start.y})`}
                opacity={(SHOOTABLE_SNAKE_SQUARES as readonly number[]).includes(snake.from) &&
                  game.players[game.currentPlayerIndex]?.snakeStuns[snake.from as ShootableSnakeSquare] > 0 ? 0.3 : 1}
              />
              {selectedTargets.includes(snake.from as ShootableSnakeSquare) && (
                <>
                  <Circle cx={snake.start.x} cy={snake.start.y} r={28} fill="none" stroke={colors.boardDark} strokeWidth={11} />
                  <Circle cx={snake.start.x} cy={snake.start.y} r={25} fill="none" stroke={colors.destructive} strokeWidth={8} />
                </>
              )}
            </React.Fragment>
          ))}
        </Svg>
        {keyPickup && <KeyPickupAnimation key={`${keyPickup.playerId}-${keyPickup.square}`} square={keyPickup.square} />}

        {game.players.map((player) => {
          const isWalking = walking?.playerId === player.id || walking?.playerIds?.includes(player.id) === true;
          const displayPosition = isWalking ? walking.position : player.position;
          if (
            displayPosition <= 0 ||
            isWalking && walking.effect === 'bamboo' && walking.position === 0 ||
            bombBlast?.victims.some((victim) => victim.playerId === player.id)
          ) return null;
          const stack = game.players.filter((other) => {
            const otherIsWalking = walking?.playerId === other.id || walking?.playerIds?.includes(other.id) === true;
            return (otherIsWalking ? walking.position : other.position) === displayPosition;
          });
          const stackIndex = stack.findIndex((other) => other.id === player.id);
          const shift = (stackIndex - (stack.length - 1) / 2) * 11;
          return (
            <AnimatedPawnSpot
              key={player.id}
              position={displayPosition}
              boardSize={boardSize}
              shift={shift}
              effect={isWalking ? walking.effect : 'step'}
              animationId={isWalking ? walking.id : 0}
            >
              <PandaToken
                color={player.color}
                carriedItem={isWalking && walking.carriedItem !== undefined
                  ? walking.carriedItem
                  : player.crownKeyRoom !== null ? 'key' : player.hasTorch ? 'torch' : null}
              />
            </AnimatedPawnSpot>
          );
        })}
        {walking?.effect === 'bamboo' && walking.position === 0 && (() => {
          const player = game.players.find((item) => item.id === walking.playerId);
          if (!player) return null;
          return (
            <HomecomingPanda
              key={`torch-return-${walking.id}`}
              animationId={walking.id}
              color={player.color}
              carriedItem={walking.carriedItem ?? (player.crownKeyRoom !== null ? 'key' : player.hasTorch ? 'torch' : null)}
              fromSquare={walking.sourcePosition ?? 100}
              boardSize={boardSize}
              delay={0}
              duration={2600}
            />
          );
        })()}
        {bombBlast && <BombBlastVisual key={`blast-${bombBlast.id}`} blast={bombBlast} />}
        {bombBlast?.victims.map((victim, index) => {
          const player = game.players.find((item) => item.id === victim.playerId);
          if (!player) return null;
          return (
            <HomecomingPanda
              key={`homecoming-${bombBlast.id}-${victim.playerId}`}
              animationId={bombBlast.id}
              color={player.color}
              carriedItem={player.crownKeyRoom !== null ? 'key' : player.hasTorch ? 'torch' : null}
              fromSquare={victim.fromSquare}
              boardSize={boardSize}
              delay={index * 150}
            />
          );
        })}
        {shot && <ShotAnimation shot={shot} boardSize={boardSize} firing={firing} />}
        {pickupNotice && <PickupNoticeVisual key={`pickup-${pickupNotice.id}`} notice={pickupNotice} />}
        {mysterySquare !== null && (
          <MysteryPowerTray
            square={mysterySquare}
            boardSize={boardSize}
            canChoose={mysteryCanChoose}
            busy={mysteryBusy}
            onChoose={onChooseMystery}
          />
        )}
        <WinnerCelebration game={game} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    maxWidth: 780,
    alignSelf: 'center',
    padding: 8,
    borderWidth: 2,
    borderRadius: 25,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.42,
    shadowRadius: 22,
    elevation: 9,
  },
  frameGradient: { ...StyleSheet.absoluteFill, borderRadius: 23 },
  frameInset: { position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, borderWidth: 1, borderColor: '#ffe596', borderRadius: 18, opacity: 0.75 },
  inner: {
    width: '100%',
    aspectRatio: 1,
    borderWidth: 3,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  mysteryTray: {
    position: 'absolute',
    left: '50%',
    top: '70%',
    width: '50%',
    height: '30%',
    zIndex: 30,
    padding: 3,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'flex-start',
    gap: 2,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 9,
  },
  mysteryTrayTitle: { fontFamily: 'Nunito_700Bold', fontSize: 8, lineHeight: 10, textAlign: 'center', letterSpacing: 0.35 },
  mysteryPowerGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'space-between', justifyContent: 'space-around', gap: 2 },
  mysteryPowerSlot: { width: '32%', height: '48%', minWidth: 0, alignItems: 'stretch', justifyContent: 'flex-start', gap: 1 },
  mysteryPowerOption: { flex: 1, width: '100%', minHeight: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 6, paddingHorizontal: 1, gap: 0, overflow: 'hidden' },
  mysteryPowerLabel: { fontFamily: 'Nunito_700Bold', fontSize: 6.5, lineHeight: 8, textAlign: 'center', flexShrink: 1 },
  mysteryGetButton: { width: '100%', minHeight: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 5, paddingHorizontal: 2 },
  mysteryGetLabel: { fontFamily: 'Nunito_700Bold', fontSize: 7, lineHeight: 9 },
  grid: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '10%',
    height: '10%',
    borderWidth: StyleSheet.hairlineWidth,
    position: 'relative',
    overflow: 'hidden',
  },
  crownCell: { borderRadius: 5, borderWidth: 1.5 },
  cellBackground: {
    ...StyleSheet.absoluteFill,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    paddingTop: 2,
    paddingBottom: 1,
    overflow: 'hidden',
  },
  targetCell: { borderWidth: 1.5 },
  squareNumber: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 10,
    lineHeight: 12,
    zIndex: 2,
  },
  crownNumber: { position: 'absolute', left: 0, right: 0, top: '67%', textAlign: 'center', fontSize: 9, lineHeight: 11, textShadowColor: '#8a3514', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  lockedRoomNumber: { zIndex: 2 },
  torchRoomGlow: {
    backgroundColor: '#f2ad31',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ffe18a',
    zIndex: 1,
  },
  keyRoomMarker: {
    position: 'absolute',
    right: 2,
    bottom: 1,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffe18a',
    backgroundColor: '#69451c',
    zIndex: 3,
  },
  keyPickupAnimation: {
    position: 'absolute',
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 28,
  },
  keyPickupSparkle: { position: 'absolute', right: -4, top: -5 },
  shotMuzzle: {
    position: 'absolute',
    width: 20,
    height: 20,
    marginLeft: -10,
    marginTop: -10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#fff1a8',
    shadowColor: '#ff6b2d',
    shadowOpacity: 0.95,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 26,
  },
  shotProjectile: {
    position: 'absolute',
    width: 10,
    height: 10,
    marginLeft: -5,
    marginTop: -5,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#fff7c6',
    backgroundColor: '#ffae42',
    shadowColor: '#ff493f',
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 27,
  },
  pickupNotice: {
    position: 'absolute',
    zIndex: 29,
    left: '5%',
    top: '50%',
    width: '90%',
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderWidth: 1.5,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 12,
  },
  pickupNoticeIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bc842e',
    backgroundColor: '#fff3c7',
  },
  pickupNoticeCopy: { flex: 1, minWidth: 0, gap: 3 },
  pickupNoticeTitle: { color: '#573313', fontFamily: 'Fredoka_600SemiBold', fontSize: 14, letterSpacing: 0.5 },
  pickupNoticeMessage: { color: '#503d2e', fontFamily: 'Nunito_600SemiBold', fontSize: 9, lineHeight: 12 },
  celebrationBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 40,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 6,
    backgroundColor: 'rgba(10, 11, 22, 0.72)',
  },
  celebrationCard: {
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 17,
    paddingVertical: 18,
    borderWidth: 1.5,
    borderColor: '#ffd46b',
    borderRadius: 20,
    backgroundColor: '#24213a',
    shadowColor: '#ffcd59',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 12,
  },
  celebrationEyebrow: { color: '#ffdf83', fontFamily: 'Nunito_700Bold', fontSize: 9, letterSpacing: 1.5 },
  celebrationTitle: { color: '#fff6d7', fontFamily: 'Fredoka_600SemiBold', fontSize: 20, textAlign: 'center' },
  celebrationSubtitle: { color: '#ffdf83', fontFamily: 'Nunito_700Bold', fontSize: 12 },
  celebrationPandas: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 54, marginTop: 2 },
  celebrationLoser: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  celebrationLoserText: { color: '#d4c8d7', fontFamily: 'Nunito_600SemiBold', fontSize: 10 },
  featureBadge: {
    position: 'absolute',
    right: '1%',
    bottom: '1%',
    width: '68%',
    height: '64%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  crownFeature: { left: '25%', top: '18%', right: 'auto', bottom: 'auto', width: '50%', height: '47%' },
  pawnSpot: {
    position: 'absolute',
    width: '10%',
    height: '10%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  homecomingPanda: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 24,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 24,
  },
  blastCell: {
    position: 'absolute',
    width: '10%',
    height: '10%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 18,
  },
  blastRing: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 20,
    borderWidth: 2.5,
  },
  blastCore: {
    width: 23,
    height: 23,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff4d2',
  },
  tokenWrap: { width: 28, height: 31, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  carriedItem: {
    position: 'absolute',
    right: -5,
    top: -2,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#fff0b1',
    backgroundColor: '#342a27',
    zIndex: 4,
  },
});
