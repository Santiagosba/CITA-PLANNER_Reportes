/** Colores teal enlazados a `--accent-*`; overrides desde branding / tema. */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        montserrat: ['Montserrat', 'sans-serif'],
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
      },
      colors: {
        teal: {
          50: 'var(--accent-50)',
          100: 'var(--accent-100)',
          200: 'var(--accent-200)',
          300: 'var(--accent-300)',
          400: 'var(--accent-400)',
          500: 'var(--accent-500)',
          600: 'var(--accent-600)',
          700: 'var(--accent-700)',
          800: 'var(--accent-800)',
          900: 'var(--accent-900)',
          950: 'var(--accent-950)',
        },
      },
      boxShadow: {
        card: '0 4px 6px -1px rgba(15, 23, 42, 0.06), 0 12px 24px -8px rgba(15, 23, 42, 0.12)',
      },
      backgroundImage: {
        'mesh-hub':
          'radial-gradient(ellipse 100% 80% at 50% -30%, rgba(20,184,166,0.12), transparent 55%), linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
      },
    },
  },
  plugins: [],
};
