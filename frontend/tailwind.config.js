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
          DEFAULT: 'var(--color-bg)',
          raised: 'var(--color-bg-raised)',
          inset: 'var(--color-bg-inset)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          soft: 'var(--color-border-soft)',
        },
        text: {
          DEFAULT: 'var(--color-text)',
          dim: 'var(--color-text-dim)',
          faint: 'var(--color-text-faint)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          soft: 'var(--color-accent-soft)',
          strong: 'var(--color-accent-strong)',
        },
        success: { DEFAULT: 'var(--color-success)', soft: 'var(--color-success-soft)' },
        warning: { DEFAULT: 'var(--color-warning)', soft: 'var(--color-warning-soft)' },
        danger:  { DEFAULT: 'var(--color-danger)', soft: 'var(--color-danger-soft)' },
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
