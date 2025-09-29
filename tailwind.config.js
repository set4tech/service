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
      colors: {
        brand: {
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.06), 0 1px 1px rgba(0,0,0,0.02)',
        cardMd: '0 4px 12px rgba(0,0,0,0.06)',
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
