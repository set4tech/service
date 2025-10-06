/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    'hover:bg-blue-50',
    'hover:shadow-sm',
    'hover:border-l-blue-500',
    'group-hover:text-blue-700',
    'group-hover:opacity-100',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        brand: {
          600: '#2563eb',
          700: '#1d4ed8',
        },
        paper: '#F8F7F2',
        ink: {
          900: '#0B0F19',
          700: '#243040',
          500: '#4B5563',
        },
        line: '#E7E5DE',
        accent: {
          600: '#0F766E',
          500: '#11827A',
          400: '#14A39A',
        },
        danger: {
          600: '#B91C1C',
          500: '#DC2626',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.06), 0 1px 1px rgba(0,0,0,0.02)',
        cardMd: '0 4px 12px rgba(0,0,0,0.06)',
        sheet: '0 8px 24px rgba(0,0,0,0.08), 0 1px 0 rgba(0,0,0,0.03)',
      },
      borderRadius: {
        sheet: '12px',
      },
      transitionTimingFunction: {
        'standard-out': 'cubic-bezier(0.2, 0, 0, 1)',
      },
      fontSize: {
        base: ['16px', '24px'],
        lg: ['18px', '28px'],
        '2xl': ['24px', '32px'],
      },
    },
  },
  plugins: [],
};
