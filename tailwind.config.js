/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#10243A', 900: '#0B1A2B', 800: '#10243A', 700: '#17304D', 600: '#1F3D61' },
        electric: { DEFAULT: '#2563EB', 50: '#EFF4FF', 100: '#DBE6FE', 200: '#BFD3FE', 500: '#2563EB', 600: '#1D4FD7', 700: '#1A3FB0' },
        cyan: { DEFAULT: '#20C4D8', 50: '#ECFBFD', 100: '#CFF4F8', 500: '#20C4D8', 600: '#17A3B5' },
        mist: { DEFAULT: '#F4F7FB', 50: '#F9FBFD', 100: '#F4F7FB', 200: '#E6ECF4', 300: '#D2DBE8' },
        go: { DEFAULT: '#16A36A', 50: '#ECFDF4', 100: '#D1FAE3', 500: '#16A36A', 600: '#128A5A' },
        amber: { DEFAULT: '#F59E0B' },
        coral: { DEFAULT: '#E5484D', 50: '#FEF2F2' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Manrope', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,36,58,0.06), 0 8px 24px -12px rgba(16,36,58,0.18)',
        lift: '0 12px 32px -12px rgba(37,99,235,0.35)',
        glow: '0 0 0 4px rgba(32,196,216,0.25)',
      },
      borderRadius: { xl2: '1.25rem' },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        'pulse-ring': { '0%': { transform: 'scale(0.9)', opacity: 0.8 }, '100%': { transform: 'scale(1.8)', opacity: 0 } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
        'slide-in': { '0%': { transform: 'translateX(16px)', opacity: 0 }, '100%': { transform: 'translateX(0)', opacity: 1 } },
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out both',
        'pulse-ring': 'pulse-ring 1.6s cubic-bezier(0.2,0.6,0.3,1) infinite',
        shimmer: 'shimmer 1.4s linear infinite',
        'slide-in': 'slide-in .3s ease-out both',
      },
    },
  },
  plugins: [],
};
