import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        xs: '475px',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        // Backgrounds
        cream: {
          DEFAULT: '#FAF7F2',
          light: '#FEFCF9',
          dark: '#F5F0E8',
        },
        // Sidebar
        forest: {
          DEFAULT: '#1B3A2D',
          light: '#2A4D3D',
        },
        // Textos
        ink: {
          DEFAULT: '#1A1A1A',
          muted: '#6B6560',
          light: '#A69E96',
        },
        // Bordes y divisores
        sand: {
          DEFAULT: '#E8E2DA',
          dark: '#E0D9D0',
          light: '#F0EBE3',
        },
        // Acentos
        terracotta: {
          DEFAULT: '#C4704B',
          dark: '#B5613E',
          light: '#D4856A',
          bg: '#FDF0E6',
        },
        olive: {
          DEFAULT: '#5C7A5E',
          light: '#8CA88F',
          bg: '#E8F5EC',
        },
        // Funcionales
        success: {
          DEFAULT: '#3D8B5E',
          bg: '#E8F5EC',
        },
        warning: {
          DEFAULT: '#A67B3D',
          bg: '#FDF6E6',
        },
        danger: {
          DEFAULT: '#9B2C2C',
          dark: '#872525',
          bg: '#FDE8E8',
        },
        alert: {
          DEFAULT: '#B5553A',
        },
        info: {
          DEFAULT: '#4A6572',
          bg: '#EDF2F4',
        },
        // Legacy primary (mantener compatibilidad temporal)
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.06)',
        'warm': '0 2px 8px rgba(196,112,75,0.08)',
      },
      borderRadius: {
        'card': '0.75rem',
      },
    },
  },
  plugins: [],
};
export default config;
