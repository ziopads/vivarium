import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        parchment: '#f4efe3',
        card: '#fbf8f0',
        ink: '#22282f',
        muted: '#6b7280',
        rust: '#b1402f',
        moss: '#5a6b4f',
        line: '#e2dccb',
      },
      fontFamily: {
        serif: ['"Iowan Old Style"', 'Palatino', '"Palatino Linotype"', 'Georgia', 'serif'],
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
