/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary colors
        dark: '#1A1A1A',
        'dark-surface': '#2D2D2D',
        light: '#FFFFFF',
        surface: '#F9FAFB',
        border: '#E5E7EB',
        // Brand colors
        primary: {
          DEFAULT: '#2563EB',
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        accent: {
          DEFAULT: '#8B5CF6',
          light: '#F3E8FF',
        },
        // Text colors
        'text-primary': '#1A1A1A',
        'text-secondary': '#6B7280',
        'text-inverse': '#FFFFFF',
        // Status colors
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        'page-title': ['24px', { fontWeight: '600', lineHeight: '1.3' }],
        'section-header': ['16px', { fontWeight: '600', lineHeight: '1.4' }],
        'body': ['14px', { fontWeight: '400', lineHeight: '1.5' }],
        'caption': ['12px', { fontWeight: '400', lineHeight: '1.5' }],
        'badge': ['11px', { fontWeight: '500', lineHeight: '1.4' }],
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
        'md': '8px',
        'lg': '12px',
        'full': '9999px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.1)',
        'modal': '0 25px 50px -12px rgba(0,0,0,0.25)',
      },
    },
  },
  plugins: [],
}
