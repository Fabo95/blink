/**
 * Blink design tokens — derived from the Enterprise Architecture document's
 * dark-violet palette (near-black background, lavender accents, 🔮 wordmark).
 * Consumed by the desktop app's Tailwind config and CSS variables so the whole
 * product stays on-brand from one source of truth.
 */
export const palette = {
  bg: '#0e0b16',
  surface: '#17131f',
  surfaceElevated: '#1e1830',
  border: '#2a2340',
  text: '#ece9f5',
  textMuted: '#9b95ad',
  primary: '#8b5cf6',
  primaryBright: '#a78bfa',
  primarySoft: '#c4b5fd',
  code: '#b8a6e8',
  danger: '#f87171',
  success: '#4ade80',
} as const;

export type PaletteToken = keyof typeof palette;
