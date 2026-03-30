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
          accent:   'var(--plt-accent)',
          primary:  'var(--plt-text-primary)',
          secondary: 'var(--plt-text-secondary)',
          muted:    'var(--plt-text-muted)',
          success:  'var(--plt-success)',
          warning:  'var(--plt-warning)',
          danger:   'var(--plt-danger)',
        },
        opportunity: {
          green: "var(--opportunity-green)",
          yellow: "var(--opportunity-yellow)",
          red: "var(--opportunity-red)",
          gray: "var(--opportunity-gray)",
        },
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        primary: { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
        secondary: { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
        destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
        muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
        accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
        card: { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
        popover: { DEFAULT: 'var(--popover)', foreground: 'var(--popover-foreground)' },
        success: { DEFAULT: 'var(--success)', foreground: 'var(--success-foreground)' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ["'Helvetica Neue'", "Helvetica", "'Plus Jakarta Sans'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      boxShadow: {
        'tactical': '0 4px 20px -2px rgba(0, 0, 0, 0.3)',
        'accent': '0 0 15px var(--plt-accent-glow)',
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
