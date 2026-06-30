/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0B0F14',     // app background — near-black slate
          raised: '#11171F',      // panels/cards
          inset: '#0E1319',       // inputs, code blocks
        },
        border: {
          DEFAULT: 'rgba(255,255,255,0.08)',
          soft: 'rgba(255,255,255,0.05)',
        },
        text: {
          DEFAULT: '#E6EDF3',
          dim: '#93A1B0',
          faint: '#5C6B7A',
        },
        accent: {
          DEFAULT: '#38BDF8',     // cyan — signal/scan, primary actions
          soft: 'rgba(56,189,248,0.12)',
          strong: '#7DD3FC',
        },
        success: { DEFAULT: '#22C55E', soft: 'rgba(34,197,94,0.12)' },
        warning: { DEFAULT: '#F59E0B', soft: 'rgba(245,158,11,0.12)' },
        danger:  { DEFAULT: '#EF4444', soft: 'rgba(239,68,68,0.12)' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(56,189,248,0.4), 0 0 16px rgba(56,189,248,0.15)',
      },
    },
  },
  plugins: [],
}
