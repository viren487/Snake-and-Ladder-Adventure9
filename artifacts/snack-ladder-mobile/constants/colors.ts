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
  text: '#f7f3e8',
  tint: '#fac02e',
  background: '#171b2c',
  foreground: '#f7f3e8',
  card: '#1b2131',
  cardForeground: '#f7f3e8',
  primary: '#fac02e',
  primaryForeground: '#141929',
  secondary: '#243756',
  secondaryForeground: '#f7f3e8',
  muted: '#272e3f',
  mutedForeground: '#a0aabb',
  accent: '#46b486',
  accentForeground: '#141929',
  destructive: '#dc3038',
  destructiveForeground: '#fff4d2',
  border: '#5c4b33',
  input: '#303a4f',
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
