import type { Config } from 'tailwindcss';

// Palette mirrors packages/core/src/theme.ts (the single source of brand truth).
export default {
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
