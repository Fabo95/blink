import { palette } from './palette.js';

/** Flatten the palette into `--blink-*` CSS custom properties. */
export function cssVariables(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(palette).map(([key, value]) => [
      `--blink-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`,
      value,
    ]),
  );
}
