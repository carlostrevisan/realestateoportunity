/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        plt: {
          bg:       'var(--plt-bg)',
          panel:    'var(--plt-panel)',
          surface:  'var(--plt-surface)',
          border:   'var(--plt-border)',
          hover:    'var(--plt-hover)',
          green:    'var(--plt-green)',
          accent:   'var(--plt-accent)',
          "accent-dim": 'var(--plt-accent-dim)',
          primary:  'var(--plt-text-primary)',
          secondary: 'var(--plt-text-secondary)',
          muted:    'var(--plt-text-muted)',
          success:  '#10b981',
          warning:  '#f59e0b',
          danger:   '#ef4444',
          running:  '#3b82f6',
        },
        opportunity: {
          green: "var(--opportunity-green)",
          yellow: "var(--opportunity-yellow)",
          red: "var(--opportunity-red)",
          gray: "var(--opportunity-gray)",
        },
      },
      fontFamily: {
        mono: ["'Cascadia Code'", "Consolas", "'Courier New'", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "blink": "blink 1.2s step-end infinite",
      },
      keyframes: {
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};
