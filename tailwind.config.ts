import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dbe6fe',
          200: '#bfd3fe',
          300: '#93b4fd',
          400: '#608dfa',
          500: '#3b66f5',
          600: '#2547ea',
          700: '#1e37d6',
          800: '#1f30ad',
          900: '#1f2e88',
          950: '#161d4f',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f6f7fb',
          dark: '#0f1320',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 6px -1px rgb(0 0 0 / 0.06)',
      },
      borderRadius: {
        xl2: '1rem',
      },
    },
  },
  plugins: [],
};

export default config;
