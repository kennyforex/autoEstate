/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        heading: 'var(--heading)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        'input-background': 'var(--input-background)',
        ring: 'var(--ring)',
        surface: 'var(--surface)',
        sidebar: 'var(--sidebar)',
        'sidebar-foreground': 'var(--sidebar-foreground)',
        placeholder: 'var(--placeholder)',
        'hover-surface': 'var(--hover-surface)',
        'warm-tan': 'var(--warm-tan)',
        'amber-gold': 'var(--amber-gold)',
        // Legacy class names used across the app
        light: 'var(--card)',
        'text-primary': 'var(--foreground)',
        'text-secondary': 'var(--muted-foreground)',
        'text-inverse': 'var(--sidebar-foreground)',
        'dark-surface': 'var(--card)',
        info: '#3b82f6',
        success: '#10b981',
        warning: '#f59e0b',
        error: 'var(--destructive)',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Source Code Pro', 'ui-monospace', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        'page-title': ['24px', { fontWeight: '700', lineHeight: '1.3' }],
        'section-header': ['16px', { fontWeight: '600', lineHeight: '1.4' }],
        'body': ['16px', { fontWeight: '400', lineHeight: '1.5' }],
        'caption': ['12px', { fontWeight: '400', lineHeight: '1.43' }],
        'badge': ['11px', { fontWeight: '500', lineHeight: '1.4' }],
        'display-hero': ['30px', { fontWeight: '800', lineHeight: '1.2', letterSpacing: '-0.75px' }],
      },
      spacing: {
        'xs': '4px',
        'sm': '8px',
        'md': '16px',
        'lg': '24px',
        'xl': '32px',
        '2xl': '48px',
      },
      borderRadius: {
        'sm': '4px',
        'md': '6px',
        'lg': '8px',
        'xl': '12px',
        'full': '9999px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.08)',
        'modal': '0 25px 50px -12px rgba(0,0,0,0.25)',
        'modal-dark': '0 25px 50px -12px rgba(0,0,0,0.5)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
