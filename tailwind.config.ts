import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Royal blue (replaces the earlier electric blue) so links, focus rings and accents match the dark royal gradients below.
        brand: {
          50: '#eef2ff',
          100: '#dfe6ff',
          200: '#c3d0ff',
          300: '#9db1fb',
          400: '#6e86f0',
          500: '#3f5fe0',
          600: '#2548c4',
          700: '#1a3699',
          800: '#142a78',
          900: '#0f2059',
          950: '#091438',
        },
        // Compass-star gold from the Globlex AI mark.
        gold: {
          50: '#fdf9ec',
          100: '#faf0cb',
          200: '#f3dd94',
          300: '#eac65c',
          400: '#deac37',
          500: '#c99425',
          600: '#a8751d',
          700: '#87591b',
          800: '#6f481c',
          900: '#5e3d1c',
          950: '#361f0d',
        },
        // Brushed-steel/gunmetal from the mark's background plate — the app's dark theme.
        steel: {
          50: '#f4f5f6',
          100: '#e3e5e8',
          200: '#c8ccd1',
          300: '#a3a9b1',
          400: '#7c828c',
          500: '#5d636c',
          600: '#454a52',
          700: '#33373d',
          800: '#25282c',
          900: '#1a1c1f',
          950: '#101113',
        },
        surface: {
          // Light theme: white page background and card surfaces.
          // The sidebar/top bar use a dark blue gradient (below) so the
          // metallic logo mark stays legible.
          DEFAULT: '#ffffff',
          muted: '#ffffff',
          dark: '#1a1c1f',
        },
      },
      backgroundImage: {
        // Dark gradient blue used for the sidebar, top bar, and mobile nav.
        'header-gradient': 'linear-gradient(180deg, #06133d 0%, #0d2680 55%, #1a3fae 100%)',
        // Dark royal blue, left to right: buttons, tabs, the footer and other accents across the app.
        'royal-gradient': 'linear-gradient(135deg, #07164a 0%, #0f2c8f 55%, #1d46bd 100%)',
        // Brushed silver-and-black, sampled from the Globlex AI logo plate: fine
        // vertical grain over a diagonal sheen from black through gunmetal to silver.
        'silver-black':
          'repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 3px), linear-gradient(135deg, #07080a 0%, #1c1f25 24%, #4a4f5a 50%, #1c1f25 76%, #07080a 100%)',
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
