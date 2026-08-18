import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Colors resolve through CSS variables so a single build can serve either
      // instance's palette. Channels are space-separated RGB (see globals.css)
      // to keep Tailwind's `bg-rust/10` opacity syntax working.
      colors: {
        parchment: 'rgb(var(--parchment) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        rust: 'rgb(var(--rust) / <alpha-value>)',
        moss: 'rgb(var(--moss) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'serif'],
        sans: ['var(--font-sans)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
