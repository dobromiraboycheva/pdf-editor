import type { Config } from 'tailwindcss';

// Brand palette: deliberately NOT red — every other PDF tool uses red as primary.
// Bold blue #0A66FF for primary CTAs; red reserved for destructive actions only.
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  // Safelist all bg-<color>-100 and text-<color>-600 used dynamically in HomePage.tsx.
  // The `softenAccent()` helper builds class names from tool.accent at runtime,
  // which the JIT compiler cannot detect via static analysis.
  safelist: [
    ...['brand', 'rose', 'emerald', 'amber', 'violet', 'pink', 'indigo', 'teal', 'cyan',
        'yellow', 'orange', 'red', 'blue', 'green', 'purple', 'slate', 'gray', 'fuchsia'].flatMap((c) => [
      `bg-${c}-50`,
      `bg-${c}-100`,
      `bg-${c}-500`,
      `bg-${c}-600`,
      `text-${c}-500`,
      `text-${c}-600`,
      `text-${c}-700`,
      `text-white`,
    ]),
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EEF3FF',
          100: '#DBE5FF',
          200: '#B7CBFF',
          300: '#8AA9FF',
          400: '#4C82FF',
          500: '#0A66FF',
          600: '#0854D6',
          700: '#0A43A6',
          800: '#0D3A84',
          900: '#0F2F66',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          muted: 'var(--surface-muted)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          muted: 'var(--ink-muted)',
        },
      },
      fontFamily: {
        sans: [
          'Inter Variable',
          'Inter',
          '-apple-system',
          'SF Pro Text',
          'system-ui',
          'sans-serif',
        ],
      },
      borderRadius: {
        card: '14px',
        button: '10px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(20,22,26,.04), 0 8px 24px rgba(20,22,26,.06)',
      },
    },
  },
  plugins: [],
};

export default config;
