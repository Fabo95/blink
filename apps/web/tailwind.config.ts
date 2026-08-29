import { palette } from '@blink/core/theme';
import type { Config } from 'tailwindcss';

// Colors come straight from packages/core/src/theme.ts — the single source of
// brand truth. shadcn-style tokens are wired to the same palette via the CSS
// variables in src/styles.css.
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        blink: {
          bg: palette.bg,
          surface: palette.surface,
          elevated: palette.surfaceElevated,
          border: palette.border,
          text: palette.text,
          muted: palette.textMuted,
          primary: palette.primary,
          bright: palette.primaryBright,
          soft: palette.primarySoft,
          code: palette.code,
          danger: palette.danger,
          success: palette.success,
        },
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(139, 92, 246, 0.25), 0 8px 30px rgba(139, 92, 246, 0.12)',
      },
    },
  },
  plugins: [],
} satisfies Config;
