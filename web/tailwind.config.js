/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: '#0A0A0B',
        surface: '#141416',
        'surface-2': '#1C1C20',
        border: '#26262B',
        'border-strong': '#3A3A40',
        'border-green': '#1a1f17',
        text: '#F5F5F4',
        muted: '#A1A1A6',
        faint: '#5d635c',
        // Money-green brand accent
        accent: { DEFAULT: '#10B981', hover: '#34D399', deep: '#0d9f6e' },
        gold: { DEFAULT: '#D4AF37', bright: '#F0CF6C' },
        // Answer tiers
        direct: '#34D399',
        inferred: '#F59E0B',
        outside: '#8E8E93',
        danger: '#F87171',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.3)',
        pop: '0 18px 50px rgba(0,0,0,0.5)',
        accent: '0 0 0 1px rgba(16,185,129,0.4), 0 4px 30px rgba(16,185,129,0.22)',
        gold: '0 10px 30px rgba(0,0,0,0.4)',
      },
      maxWidth: {
        login: '380px',
        grid: '960px',
        chat: '760px',
      },
    },
  },
  plugins: [],
}
