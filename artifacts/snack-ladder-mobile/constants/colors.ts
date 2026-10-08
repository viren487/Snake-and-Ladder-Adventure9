/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const palette = {
  text: '#fff4d2',
  tint: '#f5c653',
  background: '#171b2c',
  foreground: '#fff4d2',
  card: '#242d40',
  cardForeground: '#fff4d2',
  playerRow: '#171f2d',
  activePlayerRow: '#322e2b',
  primary: '#f5c653',
  primaryForeground: '#201a18',
  secondary: '#30394b',
  secondaryForeground: '#f4f2e9',
  muted: '#2d3547',
  mutedForeground: '#aeb9c8',
  accent: '#70ca8c',
  accentForeground: '#141929',
  destructive: '#dc3038',
  destructiveForeground: '#fff4d2',
  border: '#66543d',
  input: '#30394b',
  boardGreen: '#49d451',
  boardGreenHighlight: '#a6f75d',
  boardGreenShadow: '#26b94f',
  boardCream: '#ffe051',
  boardCreamHighlight: '#fff8a8',
  boardCreamShadow: '#f5b82f',
  boardBlue: '#37c7ef',
  boardBlueHighlight: '#83f2ff',
  boardBlueShadow: '#249be3',
  boardBulletHighlight: '#e6b64e',
  boardBulletShadow: '#bc792d',
  boardDark: '#020307',
  boardDarkBorder: '#090a0e',
  boardSpecialForeground: '#fff3cb',
  boardInk: '#193c29',
  boardFrame: '#e7a039',
  boardFrameLight: '#ffe89b',
  boardFrameDark: '#713d18',
  ladderInk: '#7a3913',
  snakeInk: '#bd4e46',
  transparentBorder: 'rgba(46, 72, 45, 0.37)',
  tokenBlue: '#36b8e6',
  tokenCoral: '#ef7653',
  tokenGreen: '#36ba7b',
  tokenPurple: '#ad78ea',
};

const colors = {
  light: { ...palette },
  dark: { ...palette },
  radius: 14,
};

export default colors;
