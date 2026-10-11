/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#f8f4e8",
      "foreground": "#22283a",
      "border": "#d7c8a5",
      "card": "#fffaf0",
      "cardForeground": "#22283a",
      "popover": "#fffaf0",
      "popoverForeground": "#22283a",
      "primary": "#d7a637",
      "primaryForeground": "#171b2c",
      "secondary": "#e8edf4",
      "secondaryForeground": "#283044",
      "muted": "#eee9dc",
      "mutedForeground": "#646d7c",
      "accent": "#218b69",
      "accentForeground": "#ffffff",
      "destructive": "#c22d37",
      "destructiveForeground": "#ffffff",
      "input": "#d7c8a5",
      "ring": "#ad7910",
      "chart1": "#49d451",
      "chart2": "#ffe051",
      "chart3": "#37c7ef",
      "chart4": "#ef7653",
      "chart5": "#ad78ea",
      "sidebar": "#f2ecdc",
      "sidebarForeground": "#22283a",
      "sidebarBorder": "#d7c8a5",
      "sidebarPrimary": "#d7a637",
      "sidebarPrimaryForeground": "#171b2c",
      "sidebarAccent": "#e8edf4",
      "sidebarAccentForeground": "#283044",
      "sidebarRing": "#ad7910"
    },
    "dark": {
      "background": "#171b2c",
      "foreground": "#fff4d2",
      "border": "#66543d",
      "card": "#242d40",
      "cardForeground": "#fff4d2",
      "popover": "#242d40",
      "popoverForeground": "#fff4d2",
      "primary": "#f5c653",
      "primaryForeground": "#201a18",
      "secondary": "#30394b",
      "secondaryForeground": "#f4f2e9",
      "muted": "#2d3547",
      "mutedForeground": "#aeb9c8",
      "accent": "#70ca8c",
      "accentForeground": "#141929",
      "destructive": "#dc3038",
      "destructiveForeground": "#fff4d2",
      "input": "#30394b",
      "ring": "#f5c653",
      "chart1": "#49d451",
      "chart2": "#ffe051",
      "chart3": "#37c7ef",
      "chart4": "#ef7653",
      "chart5": "#ad78ea",
      "sidebar": "#1b2031",
      "sidebarForeground": "#fff4d2",
      "sidebarBorder": "#66543d",
      "sidebarPrimary": "#f5c653",
      "sidebarPrimaryForeground": "#201a18",
      "sidebarAccent": "#30394b",
      "sidebarAccentForeground": "#f4f2e9",
      "sidebarRing": "#f5c653"
    }
  },
  "fontFamily": {
    "sans": [
      "Nunito",
      "sans-serif"
    ],
    "serif": [
      "Fredoka",
      "sans-serif"
    ],
    "mono": [
      "DM Mono",
      "monospace"
    ]
  },
  "radius": "0.85rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
