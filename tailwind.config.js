/** Tokens AVI CRM: mismos valores que `:root` en `src/styles/avi-crm.css`. */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    fontFamily: {
      sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      montserrat: ['Montserrat', 'sans-serif'],
    },
    fontSize: {
      '2xs': ['12px', { lineHeight: '1.5' }],
      xs: ['13px', { lineHeight: '1.5' }],
      sm: ['15px', { lineHeight: '1.5' }],
      base: ['16px', { lineHeight: '1.5' }],
      lg: ['18px', { lineHeight: '1.5' }],
      xl: ['22px', { lineHeight: '1.2', letterSpacing: '-0.035em' }],
      '2xl': ['28px', { lineHeight: '1.2', letterSpacing: '-0.04em' }],
      '3xl': ['36px', { lineHeight: '1.2', letterSpacing: '-0.045em' }],
      display: ['clamp(32px, 5vw, 52px)', { lineHeight: '1.2', letterSpacing: '-0.04em' }],
    },
    borderRadius: {
      none: '0',
      xs: 'var(--radius-xs)',
      sm: 'var(--radius-sm)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      xl: 'var(--radius-xl)',
      '2xl': 'var(--radius-2xl)',
      pill: 'var(--radius-pill)',
      full: '9999px',
    },
    extend: {
      colors: {
        avi: {
          ink: 'var(--ink)',
          fog: 'var(--fog)',
          'fog-strong': 'var(--fog-strong)',
          muted: 'var(--muted)',
          line: 'var(--line)',
          page: 'var(--page)',
          brand: 'var(--color-brand)',
          'brand-strong': 'var(--color-brand-strong)',
          'brand-soft': 'var(--color-brand-soft)',
          'brand-ring': 'var(--color-brand-ring)',
          success: 'var(--color-success)',
          warning: 'var(--color-warning)',
          danger: 'var(--color-danger)',
          surface: 'var(--color-surface)',
          'surface-solid': 'var(--color-surface-solid)',
        },
      },
      spacing: {
        tap: 'var(--tap-target)',
      },
      minHeight: {
        tap: 'var(--tap-target)',
      },
      minWidth: {
        tap: 'var(--tap-target)',
      },
      maxWidth: {
        content: 'var(--content-max)',
        field: 'var(--field-max)',
        shell: 'var(--shell-max)',
      },
      width: {
        shell: 'var(--shell-max)',
      },
      boxShadow: {
        card: 'var(--glass-shadow)',
        glass: 'inset 0 1px 0 var(--glass-highlight), 0 1px 2px rgba(15, 17, 21, 0.04)',
        brand: 'inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 6px 16px rgba(11, 99, 214, 0.28)',
        'brand-hover': 'inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 8px 22px rgba(11, 99, 214, 0.34)',
        focus: 'var(--focus-ring)',
        'focus-soft': 'inset 0 1px 0 #fff, 0 0 0 3px var(--color-brand-soft)',
      },
      transitionDuration: {
        fast: '100ms',
        base: '160ms',
      },
      transitionTimingFunction: {
        avi: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      screens: {
        compact: '420px',
        crm: '860px',
        desk: '1024px',
      },
      keyframes: {
        'live-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'live-pulse': 'live-pulse 1.38s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
