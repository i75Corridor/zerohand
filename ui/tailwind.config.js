/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        pawn: {
          gold: {
            50:  'var(--pawn-gold-50)',
            100: 'var(--pawn-gold-100)',
            200: 'var(--pawn-gold-200)',
            300: 'var(--pawn-gold-300)',
            400: 'var(--pawn-gold-400)',
            500: 'var(--pawn-gold-500)',
            600: 'var(--pawn-gold-600)',
            700: 'var(--pawn-gold-700)',
            800: 'var(--pawn-gold-800)',
            900: 'var(--pawn-gold-900)',
            950: 'var(--pawn-gold-950)',
          },
          info: {
            400: 'var(--pawn-info-400)',
            500: 'var(--pawn-info-500)',
          },
          text: {
            primary:   'var(--pawn-text-primary)',
            secondary: 'var(--pawn-text-secondary)',
            muted:     'var(--pawn-text-muted)',
          },
          chart: {
            bg:     'var(--pawn-chart-bg)',
            border: 'var(--pawn-chart-border)',
            grid:   'var(--pawn-chart-grid)',
            text:   'var(--pawn-chart-text)',
          },
          surface: {
            50:  'var(--pawn-surface-50)',
            100: 'var(--pawn-surface-100)',
            200: 'var(--pawn-surface-200)',
            300: 'var(--pawn-surface-300)',
            400: 'var(--pawn-surface-400)',
            500: 'var(--pawn-surface-500)',
            600: 'var(--pawn-surface-600)',
            700: 'var(--pawn-surface-700)',
            800: 'var(--pawn-surface-800)',
            900: 'var(--pawn-surface-900)',
            950: 'var(--pawn-surface-950)',
          },
        },
      },
      borderRadius: {
        badge:  'var(--radius-badge)',
        button: 'var(--radius-button)',
        card:   'var(--radius-card)',
        panel:  'var(--radius-panel)',
      },
      fontFamily: {
        sans: ['Satoshi', 'sans-serif'],
        display: ['Cabinet Grotesk', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        // Semantic aliases for consistent scale (major-third ratio ~1.25)
        caption: ['0.6875rem', { lineHeight: '1rem' }],     // 11px — table headers, badges
        xs: ['0.75rem', { lineHeight: '1.125rem' }],        // 12px — metadata, timestamps
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],       // 13px — secondary UI text
        base: ['0.875rem', { lineHeight: '1.5rem' }],       // 14px — body (dashboard context)
        lg: ['1rem', { lineHeight: '1.5rem' }],             // 16px — prominent body / subheads
        xl: ['1.25rem', { lineHeight: '1.75rem' }],         // 20px — page sub-titles
        '2xl': ['1.5rem', { lineHeight: '2rem' }],          // 24px — page headings
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],     // 30px — hero headings
      },
      transitionTimingFunction: {
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          // Include Tailwind's translate CSS vars so fill-mode:both doesn't
          // overwrite -translate-x-1/2 / -translate-y-1/2 centering on dialogs.
          from: { opacity: '0', transform: 'translateX(var(--tw-translate-x,0)) translateY(var(--tw-translate-y,0)) scale(0.97)' },
          to:   { opacity: '1', transform: 'translateX(var(--tw-translate-x,0)) translateY(var(--tw-translate-y,0)) scale(1)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'overlay-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'pawn-hero-float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 300ms cubic-bezier(0.25, 1, 0.5, 1)',
        'fade-in-up': 'fade-in-up 400ms cubic-bezier(0.25, 1, 0.5, 1) both',
        'scale-in': 'scale-in 250ms cubic-bezier(0.25, 1, 0.5, 1) both',
        'slide-in-right': 'slide-in-right 300ms cubic-bezier(0.25, 1, 0.5, 1) both',
        'overlay-in': 'overlay-in 200ms ease-out',
        'pawn-hero-float': 'pawn-hero-float 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
