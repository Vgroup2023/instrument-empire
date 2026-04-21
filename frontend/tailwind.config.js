/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50:  '#eef3fb',
          100: '#d5e2f5',
          200: '#aac5eb',
          300: '#80a8e1',
          400: '#558bd7',
          500: '#2b6ecd',
          600: '#1d58a4',
          700: '#16427c',
          800: '#0f2d5c',
          900: '#091b3b',
        },
        freight: {
          orange: '#f97316',
          amber:  '#f59e0b',
          green:  '#22c55e',
          red:    '#ef4444',
        },
      },
    },
  },
  plugins: [],
};
