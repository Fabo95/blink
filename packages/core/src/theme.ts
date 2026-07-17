// Blink's brand tokens — the dark-violet palette from the architecture doc.
// The single source of truth for the app's colors, name and wordmark.

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

export const brand = {
  name: 'Blink',
  tagline: 'Enterprise-Ready Local-First Task Ingestion',
} as const;

/** Flatten the palette into `--blink-*` CSS custom properties. */
export function cssVariables(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(palette).map(([key, value]) => [
      `--blink-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`,
      value,
    ]),
  );
}
