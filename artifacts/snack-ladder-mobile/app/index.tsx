import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BOOM_SQUARE,
  BULLET_PICKUP_SQUARES,
  GUN_SQUARES,
  KEY_SQUARES,
  MYSTERY_BOX_SQUARES,
  SHOOTABLE_SNAKE_SQUARES,
  choosePower,
  createGame,
  detonateBomb,
  isValidPowerState,
  passFire,
  plantBomb,
  repairLegacyGame,
  resolveDefense,
  resolveTurn,
  shootSnakes,
  useExtraDice,
  useKnife,
  useWebShooter,
  type GameState,
  type MysteryPowerType,
  type ShootableSnakeSquare,
  type TurnResolution,
} from '@workspace/game-core';
import {
  isPendingAdmission,
  isRoomSession,
  useOnlineRoom,
  sendRoomCommunication,
  type OnlineAction,
  type RoomStorage,
} from '@workspace/api-client-react';
import type { RoomSnapshot } from '@workspace/game-core/online';
import { getMrBotAction, type MrBotAction } from '@/lib/mr-bot';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { GameBoard, MOVEMENT_STEP_DURATION_MS, type BoardBlast, type BoardMotion, type BoardPickupNotice, type BoardShot } from '@/components/GameBoard';
import { PowerGlyph } from '@/components/PowerGlyph';
import { PowerInventoryRow } from '@/components/PowerInventoryRow';
import { useColors } from '@/hooks/useColors';
import { useGameSounds } from '@/lib/game-sounds';

const DICE_PIP_POSITIONS: Record<number, readonly number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

type LocalMode = 'pass' | 'bot';
type Screen = 'home' | 'game';
type SavedRound = { id: string; mode: LocalMode; updatedAt: string; game: GameState };

const ROUNDS_KEY = 'snack-ladder-mobile:saved-rounds:v1';
const ONLINE_SEAT_KEY = 'snack-ladder-mobile:online-seat:v1';
const PROFILE_KEY = 'snack-ladder-mobile:profile:v1';
const LAUNCH_MIN_VISIBLE_MS = 3000;
const LAUNCH_ARTWORK_SIZE = { width: 1024, height: 1536 } as const;
const LAUNCH_PROGRESS_BAR = { left: 230, top: 1320, width: 574, height: 31 } as const;
const PLAYER_COLORS = ['blue', 'coral', 'green', 'purple'] as const;
const MOVEMENT_STEP_DELAY_MS = MOVEMENT_STEP_DURATION_MS;
const SPECIAL_MOVE_DURATION_MS = { ladder: 2280, snake: 2080, web: 1500, knife: 1300 } as const;

type PowerSlot = 'bomb' | 'antiVenom' | 'defuser' | 'webShooter' | 'knife' | 'extraDice';

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readGame(value: unknown): GameState {
  if (!record(value) || !Array.isArray(value.players) || value.players.length < 2 || value.players.length > 4) {
    throw new Error('This saved round is not a valid game. It has been kept unchanged.');
  }
  const candidate = value as unknown as GameState;
  const playersValid = candidate.players.every((player) =>
    record(player) &&
    typeof player.id === 'string' &&
    typeof player.name === 'string' &&
    (PLAYER_COLORS as readonly string[]).includes(player.color) &&
    Number.isInteger(player.position) &&
    player.position >= 0 &&
    player.position <= 100,
  );
  if (!playersValid ||
    !Number.isInteger(candidate.currentPlayerIndex) ||
    candidate.currentPlayerIndex < 0 ||
    candidate.currentPlayerIndex >= candidate.players.length ||
    !isValidPowerState(candidate)) {
    throw new Error('This saved round has unsupported data. It has been kept unchanged.');
  }
  return repairLegacyGame(candidate);
}

function parseRounds(raw: string | null): SavedRound[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  const list = Array.isArray(parsed)
    ? parsed
    : record(parsed) && Array.isArray(parsed.rounds)
      ? parsed.rounds
      : null;
  if (!list) throw new Error('Saved rounds could not be read. The original data has not been replaced.');
  return list.map((item) => {
    if (!record(item) ||
      typeof item.id !== 'string' ||
      (item.mode !== 'pass' && item.mode !== 'bot') ||
      typeof item.updatedAt !== 'string') {
      throw new Error('A saved round has an unknown format. The original data has not been replaced.');
    }
    return {
      id: item.id,
      mode: item.mode,
      updatedAt: item.updatedAt,
      game: readGame(item.game),
    };
  });
}

function newRoundId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function niceDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Saved round'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function makeLocalGame(mode: LocalMode, count: number, playerName: string, friendName: string) {
  const game = createGame(mode === 'bot' ? 2 : count);
  return {
    ...game,
    players: game.players.map((player, index) => ({
      ...player,
      name: index === 0
        ? playerName.trim().slice(0, 24) || 'Panda Player'
        : mode === 'bot'
          ? 'Mr. Bot'
          : index === 1
            ? friendName.trim().slice(0, 24) || 'Friend'
            : `Player ${index + 1}`,
    })),
  };
}

function colorForPlayer(color: string, colors: ReturnType<typeof useColors>) {
  if (color === 'coral') return colors.tokenCoral;
  if (color === 'green') return colors.tokenGreen;
  if (color === 'purple') return colors.tokenPurple;
  return colors.tokenBlue;
}

function SolidButton({
  label,
  icon,
  onPress,
  colors,
  disabled = false,
  secondary = false,
  destructive = false,
  compact = false,
  testID,
}: {
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  disabled?: boolean;
  secondary?: boolean;
  destructive?: boolean;
  compact?: boolean;
  testID?: string;
}) {
  const backgroundColor = destructive
    ? colors.destructive
    : secondary
      ? colors.secondary
      : colors.primary;
  const color = destructive
    ? colors.destructiveForeground
    : secondary
      ? colors.secondaryForeground
      : colors.primaryForeground;
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor, opacity: disabled ? 0.45 : pressed ? 0.82 : 1 },
      ]}
    >
      {icon}
      <Text style={[styles.buttonLabel, compact && styles.buttonLabelCompact, { color }]}>{label}</Text>
    </Pressable>
  );
}

function SmallIconButton({
  label,
  icon,
  onPress,
  colors,
  testID,
  compact = false,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  testID?: string;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, compact && styles.iconButtonCompact, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
    >
      {icon}
    </Pressable>
  );
}

function Field({
  value,
  onChangeText,
  placeholder,
  colors,
  testID,
  maxLength,
  autoCapitalize = 'words',
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  colors: ReturnType<typeof useColors>;
  testID: string;
  maxLength?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  accessibilityLabel: string;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.mutedForeground}
      selectionColor={colors.primary}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      maxLength={maxLength}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      returnKeyType="done"
      onSubmitEditing={Keyboard.dismiss}
      style={[styles.input, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]}
    />
  );
}

function MobileLaunchScreen({
  colors,
  reduceMotion,
}: {
  colors: ReturnType<typeof useColors>;
  reduceMotion: boolean;
}) {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const progress = useSharedValue(0);
  const scale = Math.max(
    viewport.width / LAUNCH_ARTWORK_SIZE.width,
    viewport.height / LAUNCH_ARTWORK_SIZE.height,
  );
  const artworkWidth = LAUNCH_ARTWORK_SIZE.width * scale;
  const artworkHeight = LAUNCH_ARTWORK_SIZE.height * scale;
  const cropLeft = (artworkWidth - viewport.width) / 2;
  const cropTop = (artworkHeight - viewport.height) / 2;
  const barLeft = LAUNCH_PROGRESS_BAR.left * scale - cropLeft;
  const barTop = LAUNCH_PROGRESS_BAR.top * scale - cropTop;
  const barWidth = LAUNCH_PROGRESS_BAR.width * scale;
  const barHeight = LAUNCH_PROGRESS_BAR.height * scale;
  const progressStyle = useAnimatedStyle(() => ({
    width: barWidth * progress.value,
  }), [barWidth]);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: LAUNCH_MIN_VISIBLE_MS,
      easing: Easing.linear,
    });
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion]);

  return (
    <View
      style={[styles.launchScreen, { backgroundColor: colors.background }]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading Snake and Ladder Adventure"
      testID="launch-loading"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setViewport((current) => current.width === width && current.height === height ? current : { width, height });
      }}
    >
      <Image
        source={require('../assets/images/loading-screen.png')}
        accessibilityLabel="Snakes and Ladders Adventure loading artwork"
        resizeMode="stretch"
        style={[styles.launchArtwork, { left: -cropLeft, top: -cropTop, width: artworkWidth, height: artworkHeight }]}
      />
      {barWidth > 0 && barHeight > 0 && (
        <View
          pointerEvents="none"
          style={[styles.launchTrackMask, { left: barLeft, top: barTop, width: barWidth, height: barHeight, borderRadius: barHeight / 2 }]}
        >
          <LinearGradient
            colors={['#0b151a', '#0c1a23', '#0b181f']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.launchTrackBackground}
          />
          <Animated.View
            style={[styles.launchBarFill, { borderRadius: barHeight / 2 }, progressStyle]}
          >
            <LinearGradient
              colors={['#f7ef94', '#feb102', '#fda100']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.launchBarGradient}
            />
          </Animated.View>
        </View>
      )}
    </View>
  );
}

export default function IndexScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const sounds = useGameSounds();
  const muted = sounds.muted;
  const [screen, setScreen] = useState<Screen>('game');
  const [localMode, setLocalMode] = useState<LocalMode>('pass');
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [localGame, setLocalGame] = useState<GameState | null>(null);
  const [localRoundId, setLocalRoundId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState('Player 1');
  const [friendName, setFriendName] = useState('Player 2');
  const [localPlayerCount, setLocalPlayerCount] = useState(2);
  const [roomPlayerCount, setRoomPlayerCount] = useState(2);
  const [roomCode, setRoomCode] = useState('');
  const [savedRounds, setSavedRounds] = useState<SavedRound[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [launchMinimumElapsed, setLaunchMinimumElapsed] = useState(false);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [diceFace, setDiceFace] = useState<number | null>(null);
  const [selectedTargets, setSelectedTargets] = useState<ShootableSnakeSquare[]>([]);
  const [fireStage, setFireStage] = useState<'decision' | 'targets'>('decision');
  const [bombBlast, setBombBlast] = useState<BoardBlast | null>(null);
  const [walking, setWalking] = useState<BoardMotion | null>(null);
  const [shot, setShot] = useState<BoardShot | null>(null);
  const [firing, setFiring] = useState(false);
  const [pickupNotice, setPickupNotice] = useState<BoardPickupNotice | null>(null);
  const [remoteDisplayGame, setRemoteDisplayGame] = useState<GameState | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [activePower, setActivePower] = useState<PowerSlot | null>(null);
  const [onlinePanelOpen, setOnlinePanelOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const botTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);
  const previousOnlineGame = useRef<GameState | null>(null);
  const previousBlastGame = useRef<GameState | null>(null);
  const onlineAnimationEpoch = useRef(0);
  const localAnimationEpoch = useRef(0);
  const walkingSequence = useRef(0);
  const shotSequence = useRef(0);
  const pickupSequence = useRef(0);
  const blastSequence = useRef(0);
  const gameScrollRef = useRef<ScrollView | null>(null);

  const roomStorage = useMemo<RoomStorage>(() => ({
    async load() {
      const raw = await AsyncStorage.getItem(ONLINE_SEAT_KEY);
      if (!raw) return null;
      const value: unknown = JSON.parse(raw);
      if (!isRoomSession(value) && !isPendingAdmission(value)) {
        throw new Error('The saved room seat is invalid. It has not been overwritten.');
      }
      return value;
    },
    async save(session) {
      if (session) await AsyncStorage.setItem(ONLINE_SEAT_KEY, JSON.stringify(session));
      else await AsyncStorage.removeItem(ONLINE_SEAT_KEY);
    },
  }), []);

  const online = useOnlineRoom({
    storage: roomStorage,
    onUpdate: async (room: RoomSnapshot, animate: boolean) => {
      const previous = previousOnlineGame.current;
      previousOnlineGame.current = room.game;
      if (!animate || !room.event || !previous) {
        onlineAnimationEpoch.current += 1;
        setRemoteDisplayGame(null);
        setDiceFace(room.game.lastRoll);
        return;
      }
      const epoch = ++onlineAnimationEpoch.current;
      const event = room.event;
      const wait = (duration: number) => new Promise<void>((resolve) => setTimeout(resolve, duration));
      const stillCurrent = () => isMounted.current && onlineAnimationEpoch.current === epoch;
      const setMotion = (motion: Omit<BoardMotion, 'id'>) => {
        setWalking({ ...motion, id: ++walkingSequence.current });
      };
      setRemoteDisplayGame(previous);
      setRolling(true);
      setSelectedTargets([]);
      try {
        if (event.kind === 'roll') {
          sounds.play('dice');
          for (let tick = 0; tick < (reduceMotion ? 1 : 7); tick += 1) {
            setDiceFace(1 + Math.floor(Math.random() * 6));
            await wait(reduceMotion ? 40 : 85);
            if (!stillCurrent()) return;
          }
          setDiceFace(event.roll);
          for (const square of event.path) {
            setMotion({ playerId: event.playerId, position: square, effect: 'step' });
            sounds.play('step');
            await wait(reduceMotion ? 35 : MOVEMENT_STEP_DELAY_MS);
            if (!stillCurrent()) return;
          }
        }

        if (event.kind === 'shoot') {
          sounds.play('fire');
          setFiring(true);
          setShot({ id: ++shotSequence.current, from: event.from, targets: event.targets as ShootableSnakeSquare[] });
          await wait(reduceMotion ? 150 : 950);
          if (!stillCurrent()) return;
        }

        const moved = room.game.players.find((player) => player.id === event.playerId);
        const oldPlayer = previous.players.find((player) => player.id === event.playerId);
        if (moved && oldPlayer && (event.effect === 'web' || event.effect === 'knife')) {
          const sourcePosition = event.sourcePosition
            ?? (event.sourcePlayerId ? room.game.players.find((player) => player.id === event.sourcePlayerId)?.position : undefined)
            ?? event.from;
          setMotion({
            playerId: moved.id,
            position: moved.position,
            effect: event.effect,
            sourcePosition,
          });
          await wait(reduceMotion ? 45 : event.effect === 'web' ? SPECIAL_MOVE_DURATION_MS.web : SPECIAL_MOVE_DURATION_MS.knife);
          if (!stillCurrent()) return;
        } else if (moved && (event.effect === 'torch' || event.effect === 'return')) {
          setMotion({
            playerId: moved.id,
            position: 100,
            effect: event.effect,
            carriedItem: moved.crownKeyRoom !== null ? 'key' : 'torch',
          });
          await wait(reduceMotion ? 150 : 1100);
          if (!stillCurrent()) return;
          setMotion({
            playerId: moved.id,
            position: 100,
            effect: 'bamboo',
            carriedItem: moved.crownKeyRoom !== null ? 'key' : 'torch',
            sourcePosition: 100,
          });
          await wait(reduceMotion ? 45 : 200);
          if (event.effect === 'torch') {
            sounds.play('happy');
            setPickupNotice({ id: ++pickupSequence.current, kind: 'torch', playerName: moved.name });
          }
          setMotion({
            playerId: moved.id,
            position: 0,
            effect: 'bamboo',
            carriedItem: moved.crownKeyRoom !== null ? 'key' : 'torch',
            sourcePosition: 100,
          });
          await wait(reduceMotion ? 45 : 2680);
          if (!stillCurrent()) return;
          setMotion({
            playerId: moved.id,
            position: 0,
            effect: 'step',
            carriedItem: moved.crownKeyRoom !== null ? 'key' : 'torch',
            sourcePosition: 100,
          });
          await wait(reduceMotion ? 45 : 300);
        } else if (moved && (event.effect === 'ladder' || event.effect === 'snake')) {
          sounds.play(event.effect);
          setMotion({ playerId: moved.id, position: moved.position, effect: event.effect });
          await wait(reduceMotion ? 45 : SPECIAL_MOVE_DURATION_MS[event.effect]);
          if (!stillCurrent()) return;
        }

        const bombMessage = /(detonated the bomb|hit the boom)/i.test(room.game.message);
        if (bombMessage && (event.kind === 'detonate' || event.effect === 'boom')) {
          const victims = previous.players.flatMap((player) => {
            const after = room.game.players.find((item) => item.id === player.id);
            return after && player.position > 0 && after.position === 0
              ? [{ playerId: player.id, fromSquare: player.position }]
              : [];
          });
          if (victims.length > 0) {
            const location = room.game.message.match(/(?:house|square)\s+(\d+)/i);
            setBombBlast({
              id: ++blastSequence.current,
              sourceSquare: location ? Number(location[1]) : victims[0].fromSquare,
              victims,
            });
            sounds.play('bomb');
            await wait(reduceMotion ? 150 : 2430);
            if (!stillCurrent()) return;
            previousBlastGame.current = room.game;
          }
        }

        for (const player of room.game.players) {
          const before = previous.players.find((item) => item.id === player.id);
          if (!before) continue;
          sounds.playPickups(before, player);
          if (before.hasTorch !== player.hasTorch && player.hasTorch) {
            setPickupNotice({ id: ++pickupSequence.current, kind: 'torch', playerName: player.name });
          }
          if (before.crownKeyRoom === null && player.crownKeyRoom !== null) {
            setPickupNotice({
              id: ++pickupSequence.current,
              kind: 'key',
              playerName: player.name,
              room: player.crownKeyRoom,
            });
          }
        }
        setDiceFace(room.game.lastRoll);
      } finally {
        if (stillCurrent()) {
          setRemoteDisplayGame(null);
          setWalking(null);
          setShot(null);
          setFiring(false);
          setRolling(false);
        }
      }
    },
    onExit: () => {
      onlineAnimationEpoch.current += 1;
      previousOnlineGame.current = null;
      setRemoteDisplayGame(null);
      setWalking(null);
      setShot(null);
      setFiring(false);
      setRolling(false);
      setScreen('game');
      setSelectedTargets([]);
      setChatOpen(false);
      setActionError(null);
    },
  }, React);

  useEffect(() => {
    isMounted.current = true;
    const launchTimer = setTimeout(() => setLaunchMinimumElapsed(true), LAUNCH_MIN_VISIBLE_MS);
    void (async () => {
      try {
        const [rawRounds, storedName] = await Promise.all([
          AsyncStorage.getItem(ROUNDS_KEY),
          AsyncStorage.getItem(PROFILE_KEY),
        ]);
        const rounds = parseRounds(rawRounds);
        setSavedRounds(rounds);
        const normalizedName = storedName?.trim().slice(0, 24) || '';
        if (normalizedName) setPlayerName(normalizedName);
        const latestRound = [...rounds].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        if (latestRound) {
          setLocalMode(latestRound.mode);
          setLocalGame(latestRound.game);
          setLocalRoundId(latestRound.id);
          setDiceFace(latestRound.game.lastRoll);
        } else {
          setLocalMode('pass');
          setLocalGame(makeLocalGame('pass', 2, normalizedName || 'Player 1', 'Player 2'));
          setLocalRoundId(newRoundId());
          setDiceFace(null);
        }
      } catch (reason) {
        setSaveBlocked(true);
        setStorageError(reason instanceof Error ? reason.message : 'Saved data could not be read. It has not been replaced.');
        setLocalMode('pass');
        setLocalGame(makeLocalGame('pass', 2, 'Player 1', 'Player 2'));
        setLocalRoundId(newRoundId());
        setDiceFace(null);
      } finally {
        setStorageReady(true);
      }
    })();
    return () => {
      clearTimeout(launchTimer);
      isMounted.current = false;
      if (botTimer.current) clearTimeout(botTimer.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!pickupNotice) return;
    const timeout = setTimeout(() => setPickupNotice(null), 3200);
    return () => clearTimeout(timeout);
  }, [pickupNotice?.id]);

  useEffect(() => {
    if (!storageReady) return;
    const trimmed = playerName.trim().slice(0, 24);
    if (!trimmed) return;
    void AsyncStorage.setItem(PROFILE_KEY, trimmed).catch(() => {
      if (isMounted.current) setStorageError('Your name could not be saved on this device.');
    });
  }, [playerName, storageReady]);

  const persistRound = useCallback((round: SavedRound) => {
    if (saveBlocked) return;
    const task = saveQueue.current.catch(() => undefined).then(async () => {
      const stored = parseRounds(await AsyncStorage.getItem(ROUNDS_KEY));
      const next = [round, ...stored.filter((item) => item.id !== round.id)]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      await AsyncStorage.setItem(ROUNDS_KEY, JSON.stringify({ version: 1, rounds: next }));
      if (isMounted.current) {
        setSavedRounds(next);
        setStorageError(null);
      }
    });
    saveQueue.current = task;
    void task.catch((reason) => {
      if (isMounted.current) {
        setSaveBlocked(true);
        setStorageError(reason instanceof Error ? reason.message : 'This round could not be saved; existing saves were left unchanged.');
      }
    });
  }, [saveBlocked]);

  useEffect(() => {
    if (!storageReady || !localGame || !localRoundId || online.session || saveBlocked) return;
    persistRound({
      id: localRoundId,
      mode: localMode,
      updatedAt: new Date().toISOString(),
      game: localGame,
    });
  }, [localGame, localMode, localRoundId, online.session, persistRound, saveBlocked, storageReady]);

  useEffect(() => {
    sounds.setCelebrating(!!(online.room?.game.winnerId ?? localGame?.winnerId));
  }, [localGame?.winnerId, online.room?.game.winnerId, sounds.setCelebrating]);

  const showGame = screen === 'game' || (!!online.session && !!online.room);
  const game = online.session ? remoteDisplayGame ?? online.room?.game ?? null : localGame;
  const currentPlayer = game?.players[game.currentPlayerIndex] ?? null;
  useEffect(() => {
    if (!game) {
      previousBlastGame.current = null;
      return;
    }
    const previous = previousBlastGame.current;
    previousBlastGame.current = game;
    const blastLocation = game.message.match(/(?:house|square)\s+(\d+)/i);
    if (!previous || previous.message === game.message || !/(detonated the bomb|hit the boom)/i.test(game.message)) return;
    const sourceSquare = blastLocation ? Number(blastLocation[1]) : undefined;
    const victims = game.players.flatMap((player) => {
      const before = previous.players.find((item) => item.id === player.id);
      return before && before.position > 0 && player.position === 0
        ? [{ playerId: player.id, fromSquare: sourceSquare ?? before.position }]
        : [];
    });
    if (victims.length === 0) return;
    blastSequence.current += 1;
    setBombBlast({ id: blastSequence.current, sourceSquare: victims[0].fromSquare, victims });
    sounds.play('bomb');
  }, [game, sounds.play]);
  useEffect(() => {
    if (!bombBlast) return;
    const timeout = setTimeout(() => setBombBlast(null), 2750);
    return () => clearTimeout(timeout);
  }, [bombBlast?.id]);
  useEffect(() => {
    if (screen !== 'game' || game?.pendingChoice?.kind !== 'mystery') return;
    const timeout = setTimeout(() => gameScrollRef.current?.scrollTo({ y: 0, animated: true }), 60);
    return () => clearTimeout(timeout);
  }, [screen, game?.pendingChoice?.kind, game?.pendingChoice?.square]);
  const botId = game?.players[1]?.id;
  const botTurn = !online.session && localMode === 'bot' && !!game && game.players[game.currentPlayerIndex]?.id === botId;
  const currentPlayerIsHuman = !!currentPlayer && (!botTurn || !!online.session);
  const waitingForShot = !!game && !!currentPlayer && game.pendingFireForPlayerId === currentPlayer.id;
  useEffect(() => {
    setFireStage('decision');
    setSelectedTargets([]);
  }, [game?.pendingFireForPlayerId]);
  const actionDisabled = rolling || online.busy || !!online.pendingAdmission ||
    (!!online.session && (!online.canAct || !online.connected)) ||
    (!!botTurn && !online.session);
  const topInset = Platform.OS === 'web' ? 8 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 0 : insets.bottom;

  const saveLocalGame = useCallback((next: GameState) => {
    setLocalGame(next);
    setActionError(null);
    if (game && currentPlayer) {
      const nextPlayer = next.players.find((item) => item.id === currentPlayer.id);
      if (nextPlayer) sounds.playPickups(currentPlayer, nextPlayer);
    }
  }, [currentPlayer, game, sounds]);

  const animateLocalResolution = useCallback(async (
    before: GameState,
    resolution: TurnResolution,
    animateDice = false,
  ) => {
    const epoch = ++localAnimationEpoch.current;
    const wait = (duration: number) => new Promise<void>((resolve) => setTimeout(resolve, duration));
    const stillCurrent = () => isMounted.current && localAnimationEpoch.current === epoch;
    const setMotion = (motion: Omit<BoardMotion, 'id'>) => {
      setWalking({ ...motion, id: ++walkingSequence.current });
    };
    const actor = before.players[before.currentPlayerIndex];
    const after = resolution.state;
    setRolling(true);
    try {
      if (animateDice) {
        sounds.play('dice');
        for (let tick = 0; tick < (reduceMotion ? 1 : 7); tick += 1) {
          setDiceFace(1 + Math.floor(Math.random() * 6));
          await wait(reduceMotion ? 40 : 85);
          if (!stillCurrent()) return;
        }
        setDiceFace(after.lastRoll);
      }
      for (const square of resolution.path) {
        setMotion({ playerId: actor.id, position: square, effect: 'step' });
        sounds.play('step');
        await wait(reduceMotion ? 35 : MOVEMENT_STEP_DELAY_MS);
        if (!stillCurrent()) return;
      }

      if (resolution.effect === 'web' || resolution.effect === 'knife') {
        const moved = after.players.find((player) => {
          const old = before.players.find((item) => item.id === player.id);
          return old && old.id !== actor.id && old.position !== player.position;
        });
        const old = moved && before.players.find((player) => player.id === moved.id);
        if (moved && old) {
          setMotion({
            playerId: moved.id,
            position: moved.position,
            sourcePosition: old.position,
            effect: resolution.effect,
          });
          await wait(reduceMotion ? 45 : SPECIAL_MOVE_DURATION_MS[resolution.effect]);
          if (!stillCurrent()) return;
        }
      } else if (resolution.effect === 'torch' || resolution.effect === 'return') {
        const moved = after.players.find((player) => player.id === actor.id);
        if (moved) {
          const carriedItem = moved.crownKeyRoom !== null ? 'key' : 'torch';
          setMotion({ playerId: moved.id, position: 100, effect: resolution.effect, carriedItem });
          await wait(reduceMotion ? 150 : 1100);
          if (!stillCurrent()) return;
          setMotion({ playerId: moved.id, position: 100, effect: 'bamboo', sourcePosition: 100, carriedItem });
          await wait(reduceMotion ? 45 : 200);
          if (resolution.effect === 'torch') {
            sounds.play('happy');
            setPickupNotice({ id: ++pickupSequence.current, kind: 'torch', playerName: moved.name });
          }
          setMotion({ playerId: moved.id, position: 0, effect: 'bamboo', sourcePosition: 100, carriedItem });
          await wait(reduceMotion ? 45 : 2680);
          if (!stillCurrent()) return;
          setMotion({
            playerId: moved.id,
            position: 0,
            effect: 'step',
            carriedItem,
            sourcePosition: 100,
          });
          await wait(reduceMotion ? 45 : 300);
        }
      } else if (resolution.effect === 'snake' || resolution.effect === 'ladder') {
        const moved = after.players.find((player) => player.id === actor.id);
        if (moved) {
          sounds.play(resolution.effect);
          setMotion({ playerId: moved.id, position: moved.position, effect: resolution.effect });
          await wait(reduceMotion ? 45 : SPECIAL_MOVE_DURATION_MS[resolution.effect]);
          if (!stillCurrent()) return;
        }
      }

      const oldActor = before.players.find((player) => player.id === actor.id);
      const newActor = after.players.find((player) => player.id === actor.id);
      if (oldActor && newActor && oldActor.crownKeyRoom === null && newActor.crownKeyRoom !== null) {
        setPickupNotice({
          id: ++pickupSequence.current,
          kind: 'key',
          playerName: newActor.name,
          room: newActor.crownKeyRoom,
        });
      }
      if (stillCurrent()) saveLocalGame(after);
    } finally {
      if (stillCurrent()) {
        setWalking(null);
        setRolling(false);
      }
    }
  }, [reduceMotion, saveLocalGame, sounds]);

  const animateLocalShot = useCallback(async (before: GameState, targets: readonly ShootableSnakeSquare[]) => {
    const epoch = ++localAnimationEpoch.current;
    const wait = (duration: number) => new Promise<void>((resolve) => setTimeout(resolve, duration));
    const stillCurrent = () => isMounted.current && localAnimationEpoch.current === epoch;
    setRolling(true);
    setSelectedTargets([]);
    setFiring(true);
    sounds.play('fire');
    setShot({
      id: ++shotSequence.current,
      from: before.players[before.currentPlayerIndex].position,
      targets,
    });
    try {
      await wait(reduceMotion ? 150 : 950);
      if (stillCurrent()) saveLocalGame(shootSnakes(before, [...targets]));
    } finally {
      if (stillCurrent()) {
        setShot(null);
        setFiring(false);
        setRolling(false);
      }
    }
  }, [reduceMotion, saveLocalGame, sounds]);

  const startLocalGame = (mode: LocalMode) => {
    const next = makeLocalGame(mode, localPlayerCount, playerName, friendName);
    localAnimationEpoch.current += 1;
    setWalking(null);
    setShot(null);
    setFiring(false);
    setActivePower(null);
    setPickupNotice(null);
    setLocalMode(mode);
    setLocalGame(next);
    setLocalRoundId(newRoundId());
    setSelectedTargets([]);
    setDiceFace(null);
    setActionError(null);
    setScreen('game');
  };

  const resumeRound = (round: SavedRound) => {
    try {
      const safeGame = readGame(round.game);
      setLocalMode(round.mode);
      localAnimationEpoch.current += 1;
      setWalking(null);
      setShot(null);
      setFiring(false);
      setActivePower(null);
      setPickupNotice(null);
      setLocalGame(safeGame);
      setLocalRoundId(round.id);
      setDiceFace(safeGame.lastRoll);
      setSelectedTargets([]);
      setScreen('game');
      setActionError(null);
    } catch (reason) {
      setStorageError(reason instanceof Error ? reason.message : 'That saved round could not be opened.');
      setSaveBlocked(true);
    }
  };

  const switchLocalMode = (mode: LocalMode) => {
    setModeMenuOpen(false);
    if (mode === localMode || online.session || !storageReady) return;
    const savedModeRound = savedRounds
      .filter((round) => round.mode === mode)
      .sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt))[0];
    if (savedModeRound) resumeRound(savedModeRound);
    else startLocalGame(mode);
  };

  const chooseLocalMode = () => {
    if (online.session || !storageReady || rolling || firing) return;
    setModeMenuOpen((open) => !open);
  };

  const deleteRound = (id: string) => {
    const task = saveQueue.current.catch(() => undefined).then(async () => {
      const stored = parseRounds(await AsyncStorage.getItem(ROUNDS_KEY));
      const next = stored.filter((round) => round.id !== id);
      await AsyncStorage.setItem(ROUNDS_KEY, JSON.stringify({ version: 1, rounds: next }));
      if (isMounted.current) {
        setSavedRounds(next);
        setStorageError(null);
      }
    });
    saveQueue.current = task;
    void task.catch((reason) => {
      if (isMounted.current) setStorageError(reason instanceof Error ? reason.message : 'The saved round was not deleted.');
    });
  };

  const remoteAction = (action: OnlineAction) => {
    const allowed = action.type === 'rematch'
      ? online.connected && !online.busy && online.room?.status === 'finished'
      : action.type === 'detonate'
        ? online.canDetonate
        : online.canAct;
    if (!allowed) return;
    setActionError(null);
    void online.action(action).then((ok) => {
      if (!ok && online.error) setActionError(online.error);
    });
  };

  const applyRoll = useCallback(async () => {
    if (!game || !currentPlayer || rolling || game.winnerId || game.pendingChoice || game.pendingFireForPlayerId) return;
    if (online.session) {
      remoteAction({ type: 'roll' });
      return;
    }
    try {
      const roll = 1 + Math.floor(Math.random() * 6);
      const resolution = resolveTurn(game, roll);
      await animateLocalResolution(game, resolution, true);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'The move could not be completed.');
    }
  }, [animateLocalResolution, currentPlayer, game, online.session, remoteAction, rolling]);

  const chooseAimTargets = (choice: '98' | '99' | 'both') => {
    if (actionDisabled || !waitingForShot || !currentPlayer) return;
    const targets: ShootableSnakeSquare[] = choice === 'both' ? [98, 99] : [choice === '98' ? 98 : 99];
    if (targets.length > currentPlayer.bullets || targets.some((target) => currentPlayer.snakeStuns[target] > 0)) return;
    setSelectedTargets((current) =>
      current.length === targets.length && current.every((target, index) => target === targets[index]) ? [] : targets,
    );
  };

  const fireSelected = () => {
    if (!game || !waitingForShot || actionDisabled || selectedTargets.length === 0) return;
    if (online.session) {
      remoteAction({ type: 'shoot', targets: selectedTargets });
    } else {
      void animateLocalShot(game, selectedTargets).catch((reason) => {
        setActionError(reason instanceof Error ? reason.message : 'The shot could not be fired.');
      });
    }
    setSelectedTargets([]);
  };

  const leaveShot = () => {
    if (!game || !waitingForShot || actionDisabled) return;
    if (online.session) remoteAction({ type: 'pass' });
    else saveLocalGame(passFire(game));
    setSelectedTargets([]);
    setFireStage('decision');
  };

  const currentPowerAction = (onlineAction: OnlineAction, localRun: (state: GameState) => GameState | TurnResolution) => {
    const remoteDetonation = !!online.session && onlineAction.type === 'detonate';
    if (!game || (remoteDetonation ? !online.canDetonate : actionDisabled)) return;
    if (online.session) {
      remoteAction(onlineAction);
      return;
    }
    try {
      const result = localRun(game);
      if ('state' in result) {
        if (result.effect) {
          void animateLocalResolution(game, result).catch((reason) => {
            setActionError(reason instanceof Error ? reason.message : 'That power animation could not be completed.');
          });
        } else {
          saveLocalGame(result.state);
        }
      } else {
        saveLocalGame(result);
      }
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'That power could not be used.');
    }
  };

  const activeRivals = game && currentPlayer
    ? game.players.filter((player) => player.id !== currentPlayer.id && !(game.winnerIds ?? []).includes(player.id))
    : [];
  const usableBomb = game?.bombs.find((bomb) =>
    (!online.session || (bomb.ownerId === online.session.playerId && online.canDetonate)) &&
    (game.players.find((player) => player.id === bomb.ownerId)?.position === bomb.square ||
      (bomb.armed && game.players.some((player) => player.id !== bomb.ownerId && player.position === bomb.square && !(game.winnerIds ?? []).includes(player.id)))),
  );
  const readyToPlant = !!game && !!currentPlayer && currentPlayer.powers.bomb > 0 &&
    currentPlayer.position > 0 && !game.bombs.some((bomb) => bomb.square === currentPlayer.position);

  const performBotAction = useCallback(async (action: MrBotAction, state: GameState) => {
    try {
      switch (action.type) {
        case 'roll': {
          const roll = 1 + Math.floor(Math.random() * 6);
          const result = resolveTurn(state, roll);
          await animateLocalResolution(state, result, true);
          break;
        }
        case 'choose': saveLocalGame(choosePower(state, action.power)); break;
        case 'defend': {
          const result = resolveDefense(state, action.use);
          await animateLocalResolution(state, result);
          break;
        }
        case 'shoot': await animateLocalShot(state, action.targets); break;
        case 'pass-shot': saveLocalGame(passFire(state)); break;
        case 'extra-dice': saveLocalGame(useExtraDice(state)); break;
        case 'web': await animateLocalResolution(state, useWebShooter(state, action.targetPlayerId)); break;
        case 'knife': await animateLocalResolution(state, useKnife(state, action.targetPlayerId)); break;
        case 'plant': saveLocalGame(plantBomb(state, action.square)); break;
        case 'detonate': {
          const bomb = state.bombs.find((item) => item.id === action.bombId);
          if (bomb) saveLocalGame(detonateBomb(state, bomb.id, bomb.ownerId));
          break;
        }
      }
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Mr. Bot could not make a move.');
    }
  }, [animateLocalResolution, animateLocalShot, saveLocalGame]);

  useEffect(() => {
    if (botTimer.current) clearTimeout(botTimer.current);
    if (online.session || online.loadingSession || online.pendingAdmission || localMode !== 'bot' ||
      !showGame || !localGame || !botId) return;
    const action = getMrBotAction(localGame, botId);
    if (!action) return;
    botTimer.current = setTimeout(() => {
      botTimer.current = null;
      if (isMounted.current) performBotAction(action, localGame);
    }, 550);
    return () => {
      if (botTimer.current) clearTimeout(botTimer.current);
      botTimer.current = null;
    };
  }, [botId, localGame, localMode, online.loadingSession, online.pendingAdmission, online.session, performBotAction, showGame]);

  const createOnlineRoom = () => {
    Keyboard.dismiss();
    setActionError(null);
    void online.create(playerName.trim().slice(0, 24) || 'Panda Player', roomPlayerCount);
  };

  const joinOnlineRoom = () => {
    Keyboard.dismiss();
    if (roomCode.trim().length !== 6) {
      setActionError('Enter the six-character room code.');
      return;
    }
    setActionError(null);
    void online.join(roomCode.trim().toUpperCase(), playerName.trim().slice(0, 24) || 'Panda Player');
  };

  const shareRoomCode = async (code: string) => {
    try {
      await Share.share({ message: `Join my Snake & Ladder Adventure room: ${code}` });
    } catch {
      setActionError(`Room code: ${code}`);
    }
  };

  const sendRoomChat = async () => {
    const session = online.session;
    const room = online.room;
    const text = chatDraft.trim();
    if (!session || !room || !online.connected || !text || chatSending || room.status === 'closed') return;
    setChatSending(true);
    setActionError(null);
    try {
      await sendRoomCommunication(
        session.code,
        { type: 'chat', text },
        { headers: { Authorization: `Bearer ${session.token}` } },
      );
      setChatDraft('');
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'The room message could not be sent.');
    } finally {
      setChatSending(false);
    }
  };

  const leaveRoom = () => {
    setActionError(null);
    void online.leave();
  };

  const roomStatus = online.room;
  const renderRoomCard = (compact = false) => {
    if (!online.session) return null;
    if (!roomStatus) {
      return (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.row}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.body, { color: colors.foreground }]}>Restoring your saved room seat…</Text>
          </View>
          {!!online.error && <Text style={[styles.errorText, { color: colors.destructive }]}>{online.error}</Text>}
          <View style={styles.row}>
            <SolidButton label="Retry" icon={<Feather name="refresh-cw" size={15} color={colors.primaryForeground} />} onPress={() => void online.retry()} colors={colors} compact />
            {!online.pendingAdmission && <SolidButton label="Back to local games" onPress={leaveRoom} colors={colors} secondary compact />}
          </View>
        </View>
      );
    }
    const myMember = roomStatus.members.find((member) => member.id === roomStatus.yourPlayerId);
    return (
      <View style={[styles.card, compact && styles.compactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.roomBadge}>
            <Feather name="globe" size={14} color={colors.accent} />
            <Text style={[styles.eyebrow, { color: colors.accent }]}>ONLINE ROOM</Text>
          </View>
          <Text style={[styles.roomCode, { color: colors.primary }]}>{roomStatus.code}</Text>
        </View>
        <Text style={[styles.body, { color: colors.foreground }]}>
          {myMember?.name ?? 'You'} · {roomStatus.members.length}/{roomStatus.maxPlayers} players · {roomStatus.status}
        </Text>
        <View style={styles.memberList}>
          {roomStatus.members.map((member, index) => (
            <View key={member.id} style={styles.memberRow}>
              <View style={[styles.statusDot, { backgroundColor: member.online ? colors.accent : colors.mutedForeground }]} />
              <Text style={[styles.memberName, { color: colors.foreground }]} numberOfLines={1}>
                {member.name}{member.id === roomStatus.yourPlayerId ? ' (you)' : ''}
              </Text>
              <Text style={[styles.memberState, { color: colors.mutedForeground }]}>{member.online ? 'online' : 'offline'}</Text>
            </View>
          ))}
        </View>
        {roomStatus.status === 'waiting' && (
          <Text style={[styles.note, { color: colors.mutedForeground }]}>
            Waiting for {roomStatus.maxPlayers - roomStatus.members.length} more player{roomStatus.maxPlayers - roomStatus.members.length === 1 ? '' : 's'}.
          </Text>
        )}
        {roomStatus.status === 'playing' && roomStatus.members.some((member) => !member.online && !roomStatus.game.winnerIds.includes(member.id)) && (
          <Text style={[styles.note, { color: colors.mutedForeground }]}>An unfinished player is offline. Their original device can reconnect to the same seat.</Text>
        )}
        {roomStatus.status === 'finished' && (
          <SolidButton
            label={roomStatus.rematchVotes.includes(roomStatus.yourPlayerId) ? 'Waiting for rematch votes' : 'Request rematch'}
            onPress={() => remoteAction({ type: 'rematch' })}
            colors={colors}
            disabled={online.busy || !online.connected || roomStatus.rematchVotes.includes(roomStatus.yourPlayerId)}
          />
        )}
        {!!online.error && <Text style={[styles.errorText, { color: colors.destructive }]}>{online.error}</Text>}
        <View style={styles.row}>
          <SolidButton
            label="Share code"
            icon={<Feather name="share-2" size={15} color={colors.primaryForeground} />}
            onPress={() => void shareRoomCode(roomStatus.code)}
            colors={colors}
            compact
          />
          <SolidButton
            label={roomStatus.status === 'closed' ? 'Back to local' : 'Leave room'}
            icon={<Feather name="log-out" size={15} color={colors.secondaryForeground} />}
            onPress={leaveRoom}
            colors={colors}
            secondary
            compact
          />
        </View>
      </View>
    );
  };

  const renderSavedRounds = () => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Saved rounds</Text>
          <Text style={[styles.note, { color: colors.mutedForeground }]}>Your local games stay on this device.</Text>
        </View>
        <Text style={[styles.roundCount, { color: colors.mutedForeground }]}>{savedRounds.length}</Text>
      </View>
      {savedRounds.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Your next round will appear here automatically.</Text>
      ) : (
        savedRounds.slice(0, 8).map((round) => {
          const activeName = round.game.players[round.game.currentPlayerIndex]?.name ?? 'Saved round';
          return (
            <View key={round.id} style={[styles.savedRow, { borderTopColor: colors.border }]}>
              <View style={styles.savedInfo}>
                <Text style={[styles.savedName, { color: colors.foreground }]} numberOfLines={1}>
                  {round.mode === 'bot' ? 'Mr. Bot' : 'Pass & Play'} · {activeName}
                </Text>
                <Text style={[styles.note, { color: colors.mutedForeground }]}>{niceDate(round.updatedAt)} · {round.game.players.length} players</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Resume saved round"
                testID={`resume-round-${round.id}`}
                onPress={() => resumeRound(round)}
                style={[styles.roundAction, { backgroundColor: colors.secondary }]}
              >
                <Feather name="play" size={15} color={colors.secondaryForeground} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete saved round"
                testID={`delete-round-${round.id}`}
                onPress={() => deleteRound(round.id)}
                style={[styles.roundAction, { backgroundColor: colors.muted }]}
              >
                <Feather name="trash-2" size={15} color={colors.mutedForeground} />
              </Pressable>
            </View>
          );
        })
      )}
      {savedRounds.length > 8 && <Text style={[styles.note, { color: colors.mutedForeground }]}>Showing the 8 most recent rounds.</Text>}
    </View>
  );

  if (!storageReady || !launchMinimumElapsed || online.loadingSession) {
    return (
      <MobileLaunchScreen colors={colors} reduceMotion={reduceMotion} />
    );
  }

  if (!showGame || !game || !currentPlayer) {
    return (
      <KeyboardAwareScrollViewCompat
        style={[styles.screen, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.homeContent, { paddingTop: topInset + 12, paddingBottom: bottomInset + 28 }]}
        bottomOffset={30}
        keyboardShouldPersistTaps="handled"
        testID="home-screen"
      >
        <View style={styles.homeHeader}>
        <View style={[styles.brandMark, { backgroundColor: colors.secondary, borderColor: colors.primary }]}>
          <MaterialCommunityIcons name="crown" size={22} color={colors.primary} />
        </View>
          <View style={styles.brandCopy}>
          <Text style={[styles.brandTitle, { color: colors.foreground }]}>Snakes &amp; Ladders</Text>
          <Text style={[styles.brandSubtitle, { color: colors.mutedForeground }]}>A TINY QUEST FOR TWO</Text>
          </View>
          <SmallIconButton
            label={muted ? 'Turn sound on' : 'Mute sound'}
            onPress={() => sounds.toggleMuted()}
            colors={colors}
            icon={<Feather name={muted ? 'volume-x' : 'volume-2'} size={18} color={colors.foreground} />}
            testID="sound-toggle"
          />
          {!!localGame && (
            <SmallIconButton
              label="Return to game"
              onPress={() => setScreen('game')}
              colors={colors}
              icon={<Feather name="arrow-left" size={17} color={colors.foreground} />}
              testID="return-to-game"
            />
          )}
        </View>

        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>A CLASSIC QUEST, WITH A TWIST</Text>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>Roll, climb, and claim the crown.</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            Reach 100 for a torch, find a key in a black room, then return to unlock the crown.
          </Text>
          <View style={styles.fieldLabelRow}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Your panda name</Text>
          </View>
          <Field value={playerName} onChangeText={setPlayerName} placeholder="Panda Player" maxLength={24} colors={colors} testID="player-name" accessibilityLabel="Your panda name" />
          <View style={styles.modeCardRow}>
            <Pressable
              accessibilityRole="button"
              testID="start-pass-play"
              onPress={() => startLocalGame('pass')}
              style={({ pressed }) => [styles.modeCard, { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 }]}
            >
              <MaterialCommunityIcons name="account-multiple" size={22} color={colors.primaryForeground} />
              <Text style={[styles.modeTitle, { color: colors.primaryForeground }]}>Pass & Play</Text>
              <Text style={[styles.modeDescription, { color: colors.primaryForeground }]}>Take turns on one device</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              testID="start-mr-bot"
              onPress={() => startLocalGame('bot')}
              style={({ pressed }) => [styles.modeCard, { backgroundColor: colors.secondary, borderColor: colors.border, opacity: pressed ? 0.82 : 1 }]}
            >
              <MaterialCommunityIcons name="robot-happy-outline" size={22} color={colors.accent} />
              <Text style={[styles.modeTitle, { color: colors.foreground }]}>Play Mr. Bot</Text>
              <Text style={[styles.modeDescription, { color: colors.mutedForeground }]}>A panda opponent, any time</Text>
            </Pressable>
          </View>
          <View style={styles.fieldLabelRow}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Pass & Play players</Text>
            <View style={styles.row}>
              {[2, 3, 4].map((count) => (
                <Pressable
                  key={count}
                  accessibilityRole="button"
                  accessibilityState={{ selected: localPlayerCount === count }}
                  testID={`local-player-count-${count}`}
                  onPress={() => setLocalPlayerCount(count)}
                  style={[styles.countChip, { backgroundColor: localPlayerCount === count ? colors.primary : colors.secondary }]}
                >
                  <Text style={[styles.countChipText, { color: localPlayerCount === count ? colors.primaryForeground : colors.secondaryForeground }]}>{count}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {localPlayerCount > 1 && (
            <Field value={friendName} onChangeText={setFriendName} placeholder="Friend" maxLength={24} colors={colors} testID="friend-name" accessibilityLabel="Second player name" />
          )}
        </View>

        {!online.session && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Play online</Text>
                <Text style={[styles.note, { color: colors.mutedForeground }]}>Invite 1–3 friends on other devices.</Text>
              </View>
              <Feather name="globe" size={20} color={colors.accent} />
            </View>
            <View style={styles.fieldLabelRow}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Room size</Text>
              <View style={styles.row}>
                {[2, 3, 4].map((count) => (
                  <Pressable
                    key={count}
                    accessibilityRole="button"
                    accessibilityState={{ selected: roomPlayerCount === count }}
                    testID={`room-size-${count}`}
                    onPress={() => setRoomPlayerCount(count)}
                    style={[styles.countChip, { backgroundColor: roomPlayerCount === count ? colors.primary : colors.secondary }]}
                  >
                    <Text style={[styles.countChipText, { color: roomPlayerCount === count ? colors.primaryForeground : colors.secondaryForeground }]}>{count}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <SolidButton label={online.busy ? 'Creating room…' : 'Create a room'} icon={<Feather name="plus" size={16} color={colors.primaryForeground} />} onPress={createOnlineRoom} colors={colors} disabled={online.busy || online.loadingSession} testID="create-room" />
            <View style={styles.inputRow}>
              <Field
                value={roomCode}
                onChangeText={(value) => setRoomCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="6-character code"
                maxLength={6}
                autoCapitalize="characters"
                colors={colors}
                testID="room-code-input"
                accessibilityLabel="Room code"
              />
              <SolidButton label="Join" onPress={joinOnlineRoom} colors={colors} secondary disabled={online.busy || roomCode.trim().length !== 6} testID="join-room" />
            </View>
            <Text style={[styles.note, { color: colors.mutedForeground }]}>Rooms start when everyone joins. Local saved rounds stay separate.</Text>
            {!!online.error && <Text style={[styles.errorText, { color: colors.destructive }]}>{online.error}</Text>}
          </View>
        )}

        {!!online.session && renderRoomCard()}
        {!storageReady && (
          <View style={styles.row}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.note, { color: colors.mutedForeground }]}>Loading your saved rounds…</Text>
          </View>
        )}
        {!!storageError && <Text style={[styles.errorText, { color: colors.destructive }]}>{storageError}</Text>}
        {renderSavedRounds()}
      </KeyboardAwareScrollViewCompat>
    );
  }

  const onlineMode = !!online.session;
  const turnLocked = actionDisabled || !currentPlayerIsHuman;
  const noUnspentLandingChoice = !game.pendingChoice && !game.pendingFireForPlayerId;
  const powerButtons = currentPlayer.powers;
  const inventoryBombs = game.bombs
    .filter((bomb) => {
      const owner = game.players.find((player) => player.id === bomb.ownerId);
      const ready = owner?.position === bomb.square || bomb.armed && game.players.some((player) =>
        player.id !== bomb.ownerId && player.position === bomb.square && !game.winnerIds?.includes(player.id));
      return !(bomb.ownerId === currentPlayer.id && ready);
    })
    .map((bomb) => ({
      id: bomb.id,
      square: bomb.square,
      ownerName: game.players.find((player) => player.id === bomb.ownerId)?.name ?? 'Player',
      owned: bomb.ownerId === currentPlayer.id,
      ready: game.players.find((player) => player.id === bomb.ownerId)?.position === bomb.square ||
        bomb.armed && game.players.some((player) => player.id !== bomb.ownerId && player.position === bomb.square),
    }));
  const webTargets = activeRivals.filter((rival) =>
    powerButtons.webShooter > 0 && rival.position > currentPlayer.position && rival.position - currentPlayer.position <= 3);
  const knifeTargets = activeRivals.filter((rival) =>
    powerButtons.knife > 0 && currentPlayer.position > 0 && rival.position === currentPlayer.position);
  const powerLabels: Record<PowerSlot, string> = {
    bomb: 'Bomb',
    antiVenom: 'Anti-Venom',
    defuser: 'Bomb Defuser Kit',
    webShooter: 'Web Shooter',
    knife: 'Knife',
    extraDice: 'Extra Dice',
  };
  const powerDescriptions: Record<PowerSlot, string> = {
    bomb: 'Plant one in your room. Detonate it immediately or wait for a rival to arrive.',
    antiVenom: 'Protects against one snake bite. Choose whether to use it when you land on a snake.',
    defuser: 'Disarms one bomb. Choose whether to use it when a bomb is triggered.',
    webShooter: 'Pull a rival up to three rooms ahead back to your room.',
    knife: 'Strike a rival who is standing in your room.',
    extraDice: 'Use a stored extra roll before rolling the regular die.',
  };
  const renderPowerDetails = () => {
    if (!activePower) return null;
    const count = powerButtons[activePower];
    const available = !turnLocked && !game.winnerId;
    const defenseKind = game.pendingChoice?.kind;
    const showAntiVenomChoice = activePower === 'antiVenom' && defenseKind === 'snake';
    const showDefuserChoice = activePower === 'defuser' && defenseKind === 'bomb';
    return (
      <View style={[styles.powerDetails, { backgroundColor: colors.card, borderColor: colors.border }]} testID="power-details">
        <View style={styles.powerDetailsHeading}>
          <View style={[styles.powerDetailsIcon, { backgroundColor: activePower === 'bomb' ? '#c54d58' : activePower === 'knife' ? '#7449ac' : '#2579ad' }]}>
            {activePower === 'extraDice'
              ? <MaterialCommunityIcons name="dice-multiple" size={21} color="#fff9e7" />
              : <PowerGlyph power={activePower} size={23} />}
          </View>
          <View style={styles.powerDetailsCopy}>
            <Text style={[styles.powerDetailsTitle, { color: colors.foreground }]}>{powerLabels[activePower]}</Text>
            <Text style={[styles.powerDetailsCount, { color: colors.mutedForeground }]}>{count} in inventory</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close power details"
            onPress={() => setActivePower(null)}
            style={styles.powerDetailsClose}
          >
            <Feather name="x" size={15} color={colors.mutedForeground} />
          </Pressable>
        </View>
        <Text style={[styles.note, { color: colors.mutedForeground }]}>{powerDescriptions[activePower]}</Text>
        {showAntiVenomChoice || showDefuserChoice ? (
          <View style={styles.wrapRow}>
            <SolidButton
              label="Use protection"
              icon={<PowerGlyph power={showAntiVenomChoice ? 'antiVenom' : 'defuser'} size={24} />}
              onPress={() => currentPowerAction({ type: 'defense', use: true }, (state) => resolveDefense(state, true))}
              colors={colors}
              disabled={!available}
              compact
            />
            <SolidButton
              label="Save it"
              onPress={() => currentPowerAction({ type: 'defense', use: false }, (state) => resolveDefense(state, false))}
              colors={colors}
              secondary
              disabled={!available}
              compact
            />
          </View>
        ) : (
          <View style={styles.wrapRow}>
            {activePower === 'extraDice' && count > 0 && (
              <SolidButton
                label="Roll extra dice"
                icon={<MaterialCommunityIcons name="dice-multiple" size={15} color={colors.secondaryForeground} />}
                onPress={() => currentPowerAction({ type: 'extraDice' }, (state) => useExtraDice(state))}
                colors={colors}
                secondary
                compact
                disabled={!available || !noUnspentLandingChoice}
              />
            )}
            {activePower === 'bomb' && (
              <>
                {readyToPlant && (
                  <SolidButton
                    label="Plant bomb here"
                    icon={<PowerGlyph power="bomb" size={24} />}
                    onPress={() => currentPowerAction({ type: 'plant', square: currentPlayer.position }, (state) => plantBomb(state, currentPlayer.position))}
                    colors={colors}
                    secondary
                    compact
                    disabled={!available || !noUnspentLandingChoice}
                  />
                )}
                {!!usableBomb && (
                  <SolidButton
                    label={`Detonate room ${usableBomb.square}`}
                    icon={<PowerGlyph power="bomb" size={24} />}
                    onPress={() => currentPowerAction({ type: 'detonate', bombId: usableBomb.id }, (state) => detonateBomb(state, usableBomb.id, online.session?.playerId ?? usableBomb.ownerId))}
                    colors={colors}
                    destructive
                    compact
                    disabled={rolling || online.busy || onlineMode && !online.canDetonate}
                    testID="detonate-bomb"
                  />
                )}
                {!readyToPlant && !usableBomb && (
                  <Text style={[styles.note, { color: colors.mutedForeground }]}>Bombs can be planted only while you are on a room.</Text>
                )}
              </>
            )}
            {activePower === 'webShooter' && (
              webTargets.length > 0
                ? webTargets.map((rival) => (
                  <SolidButton
                    key={`web-${rival.id}`}
                    label={`Web · ${rival.name}`}
                    icon={<PowerGlyph power="webShooter" size={24} />}
                    onPress={() => currentPowerAction({ type: 'web', targetPlayerId: rival.id }, (state) => useWebShooter(state, rival.id))}
                    colors={colors}
                    secondary
                    compact
                    disabled={!available || !noUnspentLandingChoice}
                  />
                ))
                : <Text style={[styles.note, { color: colors.mutedForeground }]}>No rival is within web-shooter range.</Text>
            )}
            {activePower === 'knife' && (
              knifeTargets.length > 0
                ? knifeTargets.map((rival) => (
                  <SolidButton
                    key={`knife-${rival.id}`}
                    label={`Knife · ${rival.name}`}
                    icon={<PowerGlyph power="knife" size={24} />}
                    onPress={() => currentPowerAction({ type: 'knife', targetPlayerId: rival.id }, (state) => useKnife(state, rival.id))}
                    colors={colors}
                    secondary
                    compact
                    disabled={!available || !noUnspentLandingChoice}
                  />
                ))
                : <Text style={[styles.note, { color: colors.mutedForeground }]}>A rival must share your room to use the knife.</Text>
            )}
            {(activePower === 'antiVenom' || activePower === 'defuser') && (
              <Text style={[styles.note, { color: colors.mutedForeground }]}>
                {activePower === 'antiVenom' ? 'Its choice appears when you land on a snake.' : 'Its choice appears when a bomb is triggered.'}
              </Text>
            )}
          </View>
        )}
      </View>
    );
  };
  const renderDiceButton = () => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rolling ? 'Dice rolling' : onlineMode && !online.canAct ? 'Waiting for your turn' : 'Roll dice'}
      onPress={() => void applyRoll()}
      disabled={turnLocked || !!game.winnerId || !!game.pendingChoice || !!game.pendingFireForPlayerId || (onlineMode && roomStatus?.status !== 'playing')}
      style={[
        styles.diceButton,
        {
          backgroundColor: colors.primary,
          borderColor: colors.boardFrameLight,
          opacity: turnLocked || !!game.winnerId || !!game.pendingChoice || !!game.pendingFireForPlayerId || (onlineMode && roomStatus?.status !== 'playing') ? 0.55 : 1,
        },
      ]}
      testID="roll-dice"
    >
      <View style={styles.dicePipsGrid}>
        {Array.from({ length: 9 }, (_, pipIndex) => (
          <View key={pipIndex} style={styles.dicePipCell}>
            <View
              style={[
                styles.dicePip,
                {
                  backgroundColor: colors.primaryForeground,
                  opacity: DICE_PIP_POSITIONS[diceFace ?? game.lastRoll ?? 1]?.includes(pipIndex) ? 1 : 0,
                },
              ]}
            />
          </View>
        ))}
      </View>
    </Pressable>
  );

  return (
    <ScrollView
      ref={gameScrollRef}
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.gameContent, { paddingTop: topInset + 8, paddingBottom: bottomInset + 28 }]}
      keyboardShouldPersistTaps="handled"
      testID="game-screen"
    >
      <View style={styles.gameHeader}>
        <View style={styles.brandLockup}>
          <View style={[styles.brandMark, { backgroundColor: colors.secondary, borderColor: colors.primary }]}>
            <MaterialCommunityIcons name="crown" size={22} color={colors.primary} />
          </View>
          <View style={styles.gameBrandCopy}>
            <Text style={[styles.gameBrand, { color: colors.foreground }]}>Snakes &amp; Ladders</Text>
            <Text style={[styles.gameBrandSubtitle, { color: colors.mutedForeground }]}>A TINY QUEST FOR TWO</Text>
          </View>
        </View>
        <View style={styles.gameHeaderActions}>
          <SmallIconButton
            label={muted ? 'Enable sound effects' : 'Mute sound effects'}
            onPress={() => sounds.toggleMuted()}
            colors={colors}
            icon={<Feather name={muted ? 'volume-x' : 'volume-2'} size={17} color={colors.foreground} />}
            testID="sound-toggle"
            compact
          />
          {!onlineMode && windowWidth > 390 && (
            <View style={styles.modePickerWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={localMode === 'bot' ? 'Local game mode, playing Mr. Bot' : 'Local game mode, Pass and Play'}
                accessibilityState={{ expanded: modeMenuOpen }}
                onPress={chooseLocalMode}
                disabled={!storageReady || rolling || firing}
                style={[styles.localModeChip, { backgroundColor: colors.secondary, borderColor: colors.border, opacity: !storageReady || rolling || firing ? 0.65 : 1 }]}
                testID="game-mode"
              >
                <View style={[styles.statusDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.localModeCaption, { color: colors.mutedForeground }]}>LOCAL ·</Text>
                <Text style={[styles.localModeName, { color: colors.foreground }]}>{localMode === 'bot' ? 'VS. MR. BOT' : 'PASS & PLAY'}</Text>
                <Feather name="chevron-down" size={12} color={colors.mutedForeground} />
              </Pressable>
              {modeMenuOpen && (
                <View style={[styles.modeMenu, { backgroundColor: colors.card, borderColor: colors.border }]} testID="game-mode-options">
                  {([
                    { mode: 'pass', label: 'Pass & Play' },
                    { mode: 'bot', label: 'vs. Mr.Bot' },
                  ] as const).map((option) => (
                    <Pressable
                      key={option.mode}
                      accessibilityRole="button"
                      accessibilityState={{ selected: localMode === option.mode }}
                      onPress={() => switchLocalMode(option.mode)}
                      style={[styles.modeMenuItem, { backgroundColor: localMode === option.mode ? colors.secondary : 'transparent' }]}
                    >
                      <Text style={[styles.modeMenuLabel, { color: colors.foreground }]}>{option.label}</Text>
                      {localMode === option.mode && <Feather name="check" size={14} color={colors.accent} />}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}
          {onlineMode && windowWidth > 390 && (
            <View style={[styles.localModeChip, { backgroundColor: colors.secondary, borderColor: colors.border }]} testID="game-mode">
              <View style={[styles.statusDot, { backgroundColor: colors.accent }]} />
              <Text style={[styles.localModeName, { color: colors.foreground }]}>ONLINE · TWO DEVICES</Text>
            </View>
          )}
        </View>
      </View>

      {onlineMode && renderRoomCard(true)}
      {!!online.session && !!roomStatus && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${chatOpen ? 'Close' : 'Open'} room chat with ${roomStatus.chatMessages.length} messages`}
            accessibilityState={{ expanded: chatOpen }}
            testID="room-comms-toggle"
            onPress={() => setChatOpen((open) => !open)}
            style={[styles.chatToggle, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          >
            <Feather name="message-circle" size={15} color={colors.accent} />
            <Text style={[styles.chatToggleText, { color: colors.foreground }]}>Room chat</Text>
            <Text style={[styles.chatCount, { color: colors.mutedForeground }]}>{roomStatus.chatMessages.length}</Text>
            <Feather name={chatOpen ? 'chevron-up' : 'chevron-down'} size={15} color={colors.mutedForeground} />
          </Pressable>
          {chatOpen && (
            <View style={[styles.chatPanel, { backgroundColor: colors.card, borderColor: colors.border }]} testID="room-chat-voice">
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Room messages</Text>
              <ScrollView style={styles.chatLog} nestedScrollEnabled keyboardShouldPersistTaps="handled" testID="room-chat-log">
                {roomStatus.chatMessages.length === 0
                  ? <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No messages yet. Say hello to the room.</Text>
                  : roomStatus.chatMessages.map((message) => (
                    <View key={message.id} style={[styles.chatMessage, { borderColor: colors.border, backgroundColor: message.playerId === online.session?.playerId ? colors.secondary : colors.background }]}>
                      <View style={styles.chatMessageHeader}>
                        <Text style={[styles.chatMessageName, { color: colors.foreground }]}>{message.playerName}</Text>
                        <Text style={[styles.chatMessageTime, { color: colors.mutedForeground }]}>
                          {new Date(message.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </Text>
                      </View>
                      <Text style={[styles.chatMessageText, { color: colors.foreground }]}>{message.text}</Text>
                    </View>
                  ))}
              </ScrollView>
              <View style={styles.chatInputRow}>
                <TextInput
                  value={chatDraft}
                  onChangeText={setChatDraft}
                  placeholder="Write a message…"
                  placeholderTextColor={colors.mutedForeground}
                  maxLength={400}
                  editable={online.connected && roomStatus.status !== 'closed' && !chatSending}
                  returnKeyType="send"
                  onSubmitEditing={() => void sendRoomChat()}
                  accessibilityLabel="Room message"
                  testID="room-chat-input"
                  style={[styles.chatInput, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send room message"
                  testID="send-room-message"
                  disabled={!online.connected || roomStatus.status === 'closed' || chatSending || !chatDraft.trim()}
                  onPress={() => void sendRoomChat()}
                  style={[styles.chatSendButton, { backgroundColor: colors.primary, opacity: !online.connected || chatSending || !chatDraft.trim() ? 0.45 : 1 }]}
                >
                  {chatSending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="send" size={15} color={colors.primaryForeground} />}
                </Pressable>
              </View>
            </View>
          )}
        </>
      )}
      {!onlineMode && (
        <View style={[styles.onlineEntry, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${onlinePanelOpen ? 'Close' : 'Open'} online play controls`}
            accessibilityState={{ expanded: onlinePanelOpen }}
            testID="online-mode-toggle"
            onPress={() => setOnlinePanelOpen((open) => !open)}
            style={styles.onlineEntryToggle}
          >
            <View style={styles.onlineEntryTitle}>
              <Feather name="globe" size={15} color={colors.accent} />
              <Text style={[styles.onlineEntryLabel, { color: colors.foreground }]}>Play Online</Text>
            </View>
            <Feather name={onlinePanelOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
          </Pressable>
          {onlinePanelOpen && (
            <View style={styles.onlineEntryContent}>
              <Field value={playerName} onChangeText={setPlayerName} placeholder="Your name" maxLength={24} colors={colors} testID="room-player-name" accessibilityLabel="Your name for online play" />
              <View style={styles.roomSizeRow}>
                {[2, 3, 4].map((count) => (
                  <Pressable
                    key={count}
                    accessibilityRole="button"
                    accessibilityState={{ selected: roomPlayerCount === count }}
                    testID={`room-size-${count}`}
                    onPress={() => setRoomPlayerCount(count)}
                    style={[
                      styles.roomSizeChip,
                      { backgroundColor: roomPlayerCount === count ? colors.primary : colors.secondary, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.roomSizeLabel, { color: roomPlayerCount === count ? colors.primaryForeground : colors.secondaryForeground }]}>{count} players</Text>
                  </Pressable>
                ))}
              </View>
              <SolidButton
                label={online.busy ? 'Creating room…' : 'Create Room'}
                icon={<Feather name="plus" size={15} color={colors.primaryForeground} />}
                onPress={createOnlineRoom}
                colors={colors}
                disabled={online.busy || online.loadingSession}
                testID="create-room"
              />
              <View style={styles.inputRow}>
                <Field
                  value={roomCode}
                  onChangeText={(value) => setRoomCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  placeholder="6-character code"
                  maxLength={6}
                  autoCapitalize="characters"
                  colors={colors}
                  testID="room-code-input"
                  accessibilityLabel="Room code"
                />
                <SolidButton label="Join" onPress={joinOnlineRoom} colors={colors} secondary disabled={online.busy || roomCode.trim().length !== 6} testID="join-room" />
              </View>
              {!!online.error && <Text style={[styles.errorText, { color: colors.destructive }]}>{online.error}</Text>}
              <Text style={[styles.note, { color: colors.mutedForeground }]}>Invite friends on separate devices. Your local saved rounds stay separate.</Text>
            </View>
          )}
        </View>
      )}
      <GameBoard
        game={game}
        walking={walking}
        shot={shot}
        firing={firing}
        pickupNotice={pickupNotice}
        selectedTargets={selectedTargets}
        bombBlast={bombBlast}
        mysterySquare={game.pendingChoice?.kind === 'mystery' ? game.pendingChoice.square : null}
        mysteryCanChoose={currentPlayerIsHuman && !actionDisabled && (!onlineMode || online.canAct)}
        mysteryBusy={actionDisabled}
        onChooseMystery={(power) => currentPowerAction({ type: 'choose', power }, (state) => choosePower(state, power))}
      />
      {!!game.winnerId && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Play celebration music"
          disabled={sounds.muted}
          onPress={() => sounds.setCelebrating(true)}
          style={[styles.celebrationMusicButton, { borderColor: colors.border, opacity: sounds.muted ? 0.45 : 1 }]}
          testID="celebration-music"
        >
          <Feather name="music" size={13} color={colors.foreground} />
          <Text style={[styles.celebrationMusicLabel, { color: colors.foreground }]}>Play celebration music</Text>
        </Pressable>
      )}

      <View style={styles.actionPanel} testID="game-controls">
        <View style={waitingForShot ? styles.controlDockAiming : styles.controlDock}>
        {!waitingForShot && !game.winnerId && currentPlayerIsHuman && (
          <View style={styles.powerControls}>
            <PowerInventoryRow
              powers={powerButtons}
              selected={activePower}
              onSelect={(power) => setActivePower((current) => current === power ? null : power)}
              disabled={turnLocked}
              centerControl={renderDiceButton()}
              bombs={inventoryBombs}
            />
            {renderPowerDetails()}
          </View>
        )}
        {waitingForShot ? (
          <View style={[styles.aimFlow, { backgroundColor: colors.background, borderColor: colors.border }]} testID="fire-choice">
            <View style={styles.aimHeader}>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>GUN ROOM · {currentPlayer.position}</Text>
              <Text style={[styles.aimAmmo, { color: colors.mutedForeground }]}>{currentPlayer.bullets}/{5} bullets</Text>
            </View>
            {fireStage === 'decision' ? (
              <View style={styles.aimDecisionRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Fire now and choose a target"
                  onPress={() => setFireStage('targets')}
                  disabled={actionDisabled || currentPlayer.bullets < 1 || currentPlayer.snakeStuns[98] > 0 && currentPlayer.snakeStuns[99] > 0}
                  style={[styles.aimDecisionButton, { backgroundColor: colors.destructive, borderColor: colors.destructive, opacity: actionDisabled ? 0.55 : 1 }]}
                  testID="button-fire-start"
                >
                  <Feather name="crosshair" size={16} color={colors.primaryForeground} />
                  <Text style={[styles.aimDecisionLabel, { color: colors.primaryForeground }]}>Fire</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Leave this shot"
                  onPress={leaveShot}
                  disabled={actionDisabled}
                  style={[styles.aimDecisionButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: actionDisabled ? 0.55 : 1 }]}
                  testID="button-pass-fire"
                >
                  <Text style={[styles.aimDecisionLabel, { color: colors.foreground }]}>Leave this time</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={[styles.note, { color: colors.mutedForeground }]}>Choose a target. Red circles mark your aim.</Text>
                <View style={styles.aimTargetRow} accessibilityRole="radiogroup">
                  {([
                    { choice: '98', label: '98', valid: currentPlayer.bullets > 0 && currentPlayer.snakeStuns[98] === 0 },
                    { choice: '99', label: '99', valid: currentPlayer.bullets > 0 && currentPlayer.snakeStuns[99] === 0 },
                    { choice: 'both', label: 'Both', valid: currentPlayer.bullets >= 2 && currentPlayer.snakeStuns[98] === 0 && currentPlayer.snakeStuns[99] === 0 },
                  ] as const).map(({ choice, label, valid }) => {
                    const selected = choice === 'both'
                      ? selectedTargets.length === 2
                      : selectedTargets.length === 1 && selectedTargets[0] === Number(choice);
                    return (
                      <Pressable
                        key={choice}
                        accessibilityRole="radio"
                        accessibilityLabel={label === 'Both' ? 'Target both snakes using two bullets' : `Target snake ${label}`}
                        accessibilityState={{ checked: selected, disabled: !valid || actionDisabled }}
                        onPress={() => chooseAimTargets(choice)}
                        disabled={!valid || actionDisabled}
                        style={[
                          styles.aimTargetOption,
                          { backgroundColor: selected ? colors.destructive : colors.card, borderColor: selected ? colors.destructive : colors.border, opacity: valid ? 1 : 0.4 },
                        ]}
                        testID={`aim-choice-${choice}`}
                      >
                        <Text style={[styles.aimTargetOptionLabel, { color: selected ? colors.primaryForeground : colors.foreground }]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.aimSubmitRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={selectedTargets.length === 2 ? 'Fire at both snakes' : selectedTargets.length === 1 ? `Fire at snake ${selectedTargets[0]}` : 'Choose a target before firing'}
                    onPress={fireSelected}
                    disabled={actionDisabled || selectedTargets.length === 0 || selectedTargets.length > currentPlayer.bullets}
                    style={[styles.aimFireSubmit, { backgroundColor: colors.destructive, opacity: actionDisabled || selectedTargets.length === 0 ? 0.48 : 1 }]}
                    testID="fire-shot"
                  >
                    <Feather name="crosshair" size={16} color={colors.primaryForeground} />
                    <Text style={[styles.aimDecisionLabel, { color: colors.primaryForeground }]}>
                      {selectedTargets.length === 2 ? 'Fire both' : selectedTargets.length === 1 ? `Fire ${selectedTargets[0]}` : 'Fire'}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Leave this shot"
                    onPress={leaveShot}
                    disabled={actionDisabled}
                    style={styles.aimLeaveLink}
                    testID="button-pass-fire"
                  >
                    <Text style={[styles.aimLeaveLabel, { color: colors.mutedForeground }]}>Leave</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        ) : !game.winnerId && !currentPlayerIsHuman ? (
          <View style={styles.rollDock}>{renderDiceButton()}</View>
        ) : null}
        {!!game.winnerId && (
          <View style={[styles.winBanner, { backgroundColor: colors.accent, borderColor: colors.accent }]}>
            <MaterialCommunityIcons name="crown" size={15} color={colors.accentForeground} />
            <Text style={[styles.winBannerText, { color: colors.accentForeground }]}>Crown claimed!</Text>
          </View>
        )}
        </View>
        {onlineMode && roomStatus?.status === 'waiting' && (
          <Text style={[styles.note, { color: colors.mutedForeground }]}>Share the room code above. The round begins when all {roomStatus.maxPlayers} players are ready.</Text>
        )}

        {game.pendingChoice?.kind === 'mystery' && (
          <View style={styles.choiceBlock}>
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Choose a power from the compact tray at the board’s bottom-right.</Text>
          </View>
        )}

        {(game.pendingChoice?.kind === 'snake' || game.pendingChoice?.kind === 'bomb') && (
          <View style={styles.choiceBlock}>
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>
              {game.pendingChoice.kind === 'snake'
                ? 'A snake is here. Tap Anti-Venom above to use it or save it.'
                : 'A bomb was triggered. Tap Defuser Kit above to use it or save it.'}
            </Text>
          </View>
        )}

        {!!actionError && <Text style={[styles.errorText, { color: colors.destructive }]} accessibilityRole="alert">{actionError}</Text>}
        {!!online.error && <Text style={[styles.errorText, { color: colors.destructive }]} accessibilityRole="alert">{online.error}</Text>}
        {!!storageError && <Text style={[styles.note, { color: colors.mutedForeground }]}>{storageError}</Text>}
      </View>

      <View style={[styles.statusPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {!onlineMode && (
          <View style={styles.turnBanner}>
            <View style={[styles.statusDot, { backgroundColor: colorForPlayer(currentPlayer.color, colors) }]} />
            <Text style={[styles.turnText, { color: colors.secondaryForeground }]}>{currentPlayer.name}{botTurn ? ' is thinking…' : ' to play'}</Text>
          </View>
        )}
        <View style={styles.playerStrip}>
          {game.players.map((player, index) => {
            const crowned = (game.winnerIds ?? []).includes(player.id) || game.winnerId === player.id;
            const winnerIndex = (game.winnerIds ?? []).indexOf(player.id);
            const playerLabel = winnerIndex >= 0
              ? `${player.name} · Winner ${winnerIndex + 1}`
              : game.loserId === player.id
                ? `${player.name} · Last`
                : player.name;
            return (
              <View
                key={player.id}
                testID={`player-status-${player.id}`}
                style={[
                  styles.playerCard,
                  {
                    backgroundColor: index === game.currentPlayerIndex && !game.winnerId ? colors.activePlayerRow : colors.playerRow,
                    borderColor: index === game.currentPlayerIndex && !game.winnerId ? colors.primary : colors.border,
                    opacity: crowned ? 0.8 : 1,
                  },
                ]}
              >
                <View style={[styles.playerDot, { backgroundColor: colorForPlayer(player.color, colors) }]} />
                <View style={styles.playerMeta}>
                  <Text style={[styles.playerName, { color: colors.foreground }]} numberOfLines={1}>{playerLabel}</Text>
                  <Text style={[styles.playerPosition, { color: colors.mutedForeground }]}>
                    {player.position === 0 ? 'HOME' : `#${player.position}`}
                  </Text>
                </View>
                <View style={styles.playerStats}>
                  <View style={styles.playerStatGroup}>
                    <MaterialCommunityIcons name="key-variant" size={11} color={colors.primary} />
                    <Text style={[styles.playerStat, { color: colors.primary }]}>{player.crownKeyRoom !== null ? 1 : 0}/1</Text>
                  </View>
                  <View style={styles.playerStatGroup}>
                    <Feather name="circle" size={10} color={colors.foreground} />
                    <Text style={[styles.playerStat, { color: colors.foreground }]}>{player.bullets}/5</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.questPanel} accessibilityLabel="Torch, key and crown quest progress">
        <View style={styles.questSteps}>
          {[
            { label: 'Torch', done: currentPlayer.hasTorch || currentPlayer.crownKeyRoom !== null || !!game.winnerId && game.winnerIds.includes(currentPlayer.id), icon: 'flashlight' },
            { label: 'Key', done: currentPlayer.crownKeyRoom !== null || !!game.winnerId && game.winnerIds.includes(currentPlayer.id), icon: 'key-variant' },
            { label: 'Crown', done: !!game.winnerId && game.winnerIds.includes(currentPlayer.id), icon: 'crown' },
          ].map((step, index) => (
            <React.Fragment key={step.label}>
              {index > 0 && <Text style={[styles.questDivider, { color: colors.mutedForeground }]}>›</Text>}
              <View style={styles.questStep}>
                <MaterialCommunityIcons name={step.icon as 'flashlight' | 'key-variant' | 'crown'} size={14} color={step.done ? colors.accent : colors.mutedForeground} />
                <Text style={[styles.questStepText, { color: step.done ? colors.accent : colors.mutedForeground }]}>{step.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>

      <View style={[styles.messagePanel, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityLiveRegion="polite" testID="game-message">
        <MaterialCommunityIcons name="creation" size={16} color={colors.primary} />
        <Text style={[styles.gameMessage, { color: colors.foreground }]}>{game.message}</Text>
      </View>

      {!onlineMode && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New game"
          onPress={() => setScreen('home')}
          style={({ pressed }) => [styles.webNewGameButton, pressed && styles.webNewGameButtonPressed]}
          testID="button-new-game"
        >
          <LinearGradient colors={['#ffdc79', '#e9a938']} style={styles.webNewGameGradient}>
            <Feather name="rotate-ccw" size={15} color="#3e2a18" />
            <Text style={styles.webNewGameLabel}>New game</Text>
          </LinearGradient>
        </Pressable>
      )}

      <View style={styles.panelFooter}>
        <Text style={[styles.panelFooterText, { color: colors.mutedForeground }]}>TURN {String(game.turnNumber).padStart(2, '0')}</Text>
        <Text style={[styles.panelFooterText, { color: colors.mutedForeground }]}>YOUR TABLE, YOUR QUEST</Text>
      </View>
    </ScrollView>
  );
}

 const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#171b2c' },
  launchScreen: { flex: 1, overflow: 'hidden' },
  launchArtwork: { position: 'absolute' },
  launchTrackMask: { position: 'absolute', overflow: 'hidden' },
  launchTrackBackground: { flex: 1 },
  launchBarFill: { position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden' },
  launchBarGradient: { flex: 1 },
  homeContent: { paddingHorizontal: 12, gap: 14 },
  gameContent: { paddingHorizontal: 12, gap: 8 },
  homeHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 2 },
  brandCopy: { flex: 1 },
  brandTitle: { fontFamily: 'Fredoka_600SemiBold', fontSize: 20, letterSpacing: 0.1 },
  brandSubtitle: { fontFamily: 'monospace', fontSize: 8, letterSpacing: 1.15, marginTop: 1 },
  heroCard: { padding: 17, borderRadius: 22, borderWidth: 1, gap: 10, shadowColor: '#080b14', shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.24, shadowRadius: 14, elevation: 4 },
  eyebrow: { fontFamily: 'Nunito_700Bold', fontSize: 10, letterSpacing: 1.1 },
  heroTitle: { fontFamily: 'Fredoka_600SemiBold', fontSize: 28, lineHeight: 32, marginTop: -3 },
  body: { fontFamily: 'Nunito_600SemiBold', fontSize: 14, lineHeight: 20 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3, gap: 8 },
  fieldLabel: { fontFamily: 'Nunito_700Bold', fontSize: 13 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontFamily: 'Nunito_600SemiBold', fontSize: 14 },
  modeCardRow: { flexDirection: 'row', gap: 9, marginTop: 3 },
  modeCard: { flex: 1, minHeight: 106, borderWidth: 1, borderColor: 'transparent', padding: 12, borderRadius: 17, gap: 4, justifyContent: 'center' },
  modeTitle: { fontFamily: 'Fredoka_600SemiBold', fontSize: 17, marginTop: 2 },
  modeDescription: { fontFamily: 'Nunito_600SemiBold', fontSize: 11, lineHeight: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  wrapRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  powerControls: { flex: 1, minWidth: 0, gap: 7 },
  powerDetails: { padding: 10, borderWidth: 1, borderRadius: 14, gap: 8 },
  powerDetailsHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  powerDetailsIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  powerDetailsCopy: { flex: 1, minWidth: 0, gap: 1 },
  powerDetailsTitle: { fontFamily: 'Fredoka_600SemiBold', fontSize: 14 },
  powerDetailsCount: { fontFamily: 'monospace', fontSize: 8, letterSpacing: 0.35 },
  powerDetailsClose: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  countChip: { minWidth: 44, minHeight: 42, paddingHorizontal: 12, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  countChipText: { fontFamily: 'Nunito_700Bold', fontSize: 13 },
  card: { padding: 15, borderRadius: 20, borderWidth: 1, gap: 10, shadowColor: '#080b14', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 3 },
  compactCard: { padding: 12, borderRadius: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontFamily: 'Fredoka_600SemiBold', fontSize: 20 },
  note: { fontFamily: 'Nunito_600SemiBold', fontSize: 11, lineHeight: 16 },
  roomBadge: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  roomCode: { fontFamily: 'Nunito_700Bold', fontSize: 18, letterSpacing: 2 },
  onlineEntry: { marginBottom: 3, borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  onlineEntryToggle: { minHeight: 46, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  onlineEntryTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  onlineEntryLabel: { fontFamily: 'Fredoka_600SemiBold', fontSize: 14 },
  onlineEntryContent: { paddingHorizontal: 12, paddingBottom: 12, gap: 9 },
  roomSizeRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  roomSizeChip: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12 },
  roomSizeLabel: { fontFamily: 'Nunito_700Bold', fontSize: 11 },
  memberList: { gap: 6 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  memberName: { flex: 1, fontFamily: 'Nunito_700Bold', fontSize: 12 },
  memberState: { fontFamily: 'Nunito_600SemiBold', fontSize: 10 },
  button: { minHeight: 48, borderRadius: 15, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  buttonCompact: { minHeight: 42, borderRadius: 13, paddingHorizontal: 12 },
  buttonLabel: { fontFamily: 'Nunito_700Bold', fontSize: 14 },
  buttonLabelCompact: { fontSize: 12 },
  iconButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  iconButtonCompact: { width: 36, height: 36, borderRadius: 11 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chatToggle: { minHeight: 40, paddingHorizontal: 12, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 8 },
  chatToggleText: { flex: 1, fontFamily: 'Nunito_700Bold', fontSize: 12 },
  chatCount: { fontFamily: 'monospace', fontSize: 10 },
  chatPanel: { padding: 12, borderWidth: 1, borderRadius: 16, gap: 8 },
  chatLog: { maxHeight: 178 },
  chatMessage: { padding: 9, marginBottom: 6, borderWidth: 1, borderRadius: 12, gap: 4 },
  chatMessageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chatMessageName: { fontFamily: 'Nunito_700Bold', fontSize: 10 },
  chatMessageTime: { fontFamily: 'monospace', fontSize: 8 },
  chatMessageText: { fontFamily: 'Nunito_600SemiBold', fontSize: 12, lineHeight: 17 },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  chatInput: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, fontFamily: 'Nunito_600SemiBold', fontSize: 12 },
  chatSendButton: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: 'Nunito_600SemiBold', fontSize: 12, paddingVertical: 8 },
  roundCount: { fontFamily: 'Nunito_700Bold', fontSize: 13 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  savedInfo: { flex: 1, gap: 2 },
  savedName: { fontFamily: 'Nunito_700Bold', fontSize: 13 },
  roundAction: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontFamily: 'Nunito_700Bold', fontSize: 12, lineHeight: 17 },
  gameHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, minHeight: 46, marginBottom: 2 },
  gameHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0, zIndex: 20 },
  modePickerWrap: { position: 'relative', zIndex: 21 },
  modeMenu: { position: 'absolute', top: 40, right: 0, width: 154, padding: 5, borderWidth: 1, borderRadius: 12, zIndex: 30, elevation: 8, shadowColor: '#080b14', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.32, shadowRadius: 10 },
  modeMenuItem: { minHeight: 38, paddingHorizontal: 9, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeMenuLabel: { fontFamily: 'Nunito_700Bold', fontSize: 12 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 },
  brandMark: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  gameBrandCopy: { flex: 1, minWidth: 0 },
  gameBrand: { fontFamily: 'Fredoka_600SemiBold', fontSize: 20, lineHeight: 24 },
  gameBrandSubtitle: { fontFamily: 'monospace', fontSize: 8, letterSpacing: 1.15, marginTop: 1 },
  localModeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 9, borderWidth: 1, borderRadius: 99 },
  localModeCaption: { fontFamily: 'monospace', fontSize: 7, letterSpacing: 0.7 },
  localModeName: { fontFamily: 'monospace', fontSize: 7, letterSpacing: 0.2 },
  statusPanel: { padding: 0, borderRadius: 0, borderWidth: 0, gap: 0, backgroundColor: 'transparent' },
  turnBanner: { display: 'none', minHeight: 28, borderRadius: 0, borderWidth: 0, paddingHorizontal: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  turnText: { flex: 1, fontFamily: 'Nunito_700Bold', fontSize: 14 },
  playerStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  playerCard: { flex: 1, flexBasis: 140, minWidth: 0, minHeight: 32, borderRadius: 10, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  playerDot: { width: 10, height: 10, borderRadius: 5 },
  playerMeta: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  playerName: { flexShrink: 1, minWidth: 0, fontFamily: 'Nunito_700Bold', fontSize: 10 },
  playerPosition: { flexShrink: 0, fontFamily: 'monospace', fontSize: 9, letterSpacing: 0.2 },
  playerStats: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  playerStatGroup: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  playerStat: { fontFamily: 'monospace', fontSize: 8 },
  questPanel: { alignSelf: 'center', paddingHorizontal: 4, paddingVertical: 3 },
  questTitle: { fontFamily: 'Fredoka_600SemiBold', fontSize: 16, lineHeight: 20 },
  questSteps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  questStep: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  questStepText: { fontFamily: 'Nunito_700Bold', fontSize: 11 },
  questDivider: { fontFamily: 'Fredoka_600SemiBold', fontSize: 17 },
  actionPanel: { marginTop: 7, paddingVertical: 1, borderRadius: 0, borderWidth: 0, gap: 10 },
  actionTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  controlDock: { width: '100%', minHeight: 94, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 2 },
  controlDockAiming: { width: '100%' },
  rollDock: { alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  diceButton: {
    width: 64,
    height: 64,
    borderWidth: 2,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  dicePipsGrid: { width: 39, height: 39, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'space-between', justifyContent: 'space-between' },
  dicePipCell: { width: 13, height: 13, alignItems: 'center', justifyContent: 'center' },
  dicePip: { width: 7, height: 7, borderRadius: 4 },
  aimFlow: { width: '100%', borderWidth: 1, borderRadius: 15, padding: 10, gap: 9 },
  aimHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  aimAmmo: { fontFamily: 'Nunito_700Bold', fontSize: 10 },
  aimDecisionRow: { flexDirection: 'row', gap: 8 },
  aimDecisionButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 8, borderWidth: 1, borderRadius: 13 },
  aimDecisionLabel: { fontFamily: 'Nunito_700Bold', fontSize: 13 },
  aimTargetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 2 },
  aimTargetOption: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  aimTargetOptionLabel: { fontFamily: 'Fredoka_600SemiBold', fontSize: 15 },
  aimSubmitRow: { alignItems: 'center', gap: 3 },
  aimFireSubmit: { width: '68%', minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13, paddingHorizontal: 12 },
  aimLeaveLink: { minHeight: 26, justifyContent: 'center', paddingHorizontal: 12 },
  aimLeaveLabel: { fontFamily: 'Nunito_700Bold', fontSize: 11 },
  diceResult: { fontFamily: 'Fredoka_600SemiBold', fontSize: 30, lineHeight: 34 },
  messagePanel: { flexDirection: 'row', alignItems: 'center', padding: 14, minHeight: 66, borderRadius: 15, borderWidth: 1, gap: 10 },
  gameMessage: { flex: 1, fontFamily: 'Nunito_600SemiBold', fontSize: 12, lineHeight: 17 },
  webNewGameButton: { width: '100%', minHeight: 52, borderWidth: 1, borderColor: '#ffe08a', borderRadius: 12, overflow: 'hidden', shadowColor: '#9a5a20', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.7, shadowRadius: 6, elevation: 4 },
  webNewGameButtonPressed: { transform: [{ translateY: 2 }], shadowOpacity: 0.35, elevation: 2 },
  webNewGameGradient: { minHeight: 50, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  webNewGameLabel: { color: '#3e2a18', fontFamily: 'Fredoka_600SemiBold', fontSize: 15 },
  celebrationMusicButton: { alignSelf: 'flex-start', minHeight: 34, marginTop: 2, marginBottom: 2, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10 },
  celebrationMusicLabel: { fontFamily: 'Nunito_700Bold', fontSize: 11 },
  winBanner: { minHeight: 42, alignSelf: 'center', marginTop: 5, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderRadius: 13 },
  winBannerText: { fontFamily: 'Fredoka_600SemiBold', fontSize: 14 },
  panelFooter: { width: '100%', marginTop: 2, paddingHorizontal: 3, paddingTop: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelFooterText: { fontFamily: 'monospace', fontSize: 8, letterSpacing: 0.7 },
  choiceBlock: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)', paddingTop: 10, gap: 8 },
  sectionLabel: { fontFamily: 'Nunito_700Bold', fontSize: 12 },
});
