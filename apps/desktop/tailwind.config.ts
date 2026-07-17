import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

// Palette mirrors packages/core/src/theme.ts (the single source of brand truth).
// shadcn/ui tokens (below) are wired to the same violet palette via CSS variables
// in src/styles.css, so shadcn components inherit the Blink theme.
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        blink: {
          bg: '#0e0b16',
          surface: '#17131f',
          elevated: '#1e1830',
          border: '#2a2340',
          text: '#ece9f5',
          muted: '#9b95ad',
          primary: '#8b5cf6',
          bright: '#a78bfa',
          soft: '#c4b5fd',
          code: '#b8a6e8',
          danger: '#f87171',
          success: '#4ade80',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
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
  plugins: [animate],
} satisfies Config;
