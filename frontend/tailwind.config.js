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
          DEFAULT: '#F4FBF6',     // app background — original light mint
          raised: '#FFFFFF',      // panels/cards
          inset: '#F0F7F2',       // inputs, code blocks
        },
        border: {
          DEFAULT: 'rgba(15,23,16,0.10)',
          soft: 'rgba(15,23,16,0.06)',
        },
        text: {
          DEFAULT: '#14241A',
          dim: '#44574A',
          faint: '#6E8276',
        },
        accent: {
          DEFAULT: '#16A34A',     // original green accent
          soft: 'rgba(22,163,74,0.12)',
          strong: '#22C55E',
        },
        success: { DEFAULT: '#16A34A', soft: 'rgba(22,163,74,0.12)' },
        warning: { DEFAULT: '#D97706', soft: 'rgba(217,119,6,0.12)' },
        danger:  { DEFAULT: '#DC2626', soft: 'rgba(220,38,38,0.12)' },
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        sm: '12px',
        md: '18px',
        lg: '26px',
      },
      boxShadow: {
        glow: '0 6px 16px rgba(20,40,25,0.06)',
      },
    },
  },
  plugins: [],
}
