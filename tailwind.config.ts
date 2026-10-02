import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Electric blue from the Globlex AI mark's "AI" wordmark/circuit lines.
        brand: {
          50: '#eaf7ff',
          100: '#cdedff',
          200: '#9edcff',
          300: '#65c6ff',
          400: '#2fabff',
          500: '#0d8dff',
          600: '#0070e6',
          700: '#0059b8',
          800: '#064a92',
          900: '#0b3f78',
          950: '#08284d',
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
        'header-gradient': 'linear-gradient(180deg, #0a1a35 0%, #1e3a6e 100%)',
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
