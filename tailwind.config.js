/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    'hover:bg-sage-50',
    'hover:shadow-sm',
    'hover:border-l-sage-600',
    'group-hover:text-sage-700',
    'group-hover:opacity-100',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Sage palette - the foundation of our identity
        sage: {
          50: '#f4f7f5',
          100: '#e8eeea',
          200: '#dce5df',
          300: '#c8d4cc',
          400: '#a8bab0',
          500: '#889a90',
          600: '#6b7d73',
          700: '#566560',
          800: '#48544d',
          900: '#3d4742',
        },
        // Paper background - warm off-white
        paper: '#f5f2e8',
        // Ink text colors
        ink: {
          900: '#0B0F19',
          700: '#243040',
          500: '#4B5563',
        },
        // Border/divider color
        line: '#E7E5DE',
        // Teal accent (blueprint/engineering reference)
        accent: {
          600: '#0F766E',
          500: '#11827A',
          400: '#14A39A',
        },
        // Danger actions
        danger: {
          600: '#B91C1C',
          500: '#DC2626',
        },
        // Document-style status colors (stamps, not alerts)
        status: {
          compliant: {
            bg: '#e8f0e8',
            text: '#2d5a2d',
          },
          'non-compliant': {
            bg: '#f0e8e8',
            text: '#6b3333',
          },
          pending: {
            bg: '#e8ecf0',
            text: '#3d4f5f',
          },
          unclear: {
            bg: '#f0ede8',
            text: '#5c4d3d',
          },
          'not-applicable': {
            bg: '#ebebeb',
            text: '#5c5c5c',
          },
        },
        // Dark theme for violations panel
        dark: {
          bg: '#3d4a4a',
          card: '#4d5a5a',
          hover: '#5d6a6a',
          border: '#2d3838',
        },
      },
      boxShadow: {
        // Reduced shadows - prefer borders for containment
        card: '0 1px 2px rgba(0,0,0,0.04)',
        cardMd: '0 4px 8px rgba(0,0,0,0.05)',
        // Shadows reserved for floating elements
        sheet: '0 8px 24px rgba(0,0,0,0.08), 0 1px 0 rgba(0,0,0,0.03)',
      },
      borderRadius: {
        sheet: '12px',
      },
      borderWidth: {
        hairline: '0.5px',
      },
      transitionTimingFunction: {
        'standard-out': 'cubic-bezier(0.2, 0, 0, 1)',
      },
      fontSize: {
        // Compact data-dense typography
        '2xs': ['11px', '14px'],
        xs: ['12px', '16px'],
        sm: ['13px', '18px'],
        base: ['14px', '20px'],
        lg: ['16px', '24px'],
        xl: ['18px', '28px'],
        '2xl': ['24px', '32px'],
      },
    },
  },
  plugins: [],
};
