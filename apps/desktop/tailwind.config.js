/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Sora', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // ==========================================================================
        // CSS VARIABLE BASED COLORS (shadcn-style)
        // ==========================================================================
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          foreground: 'rgb(var(--card-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
        },
        border: 'rgb(var(--border) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',

        // ==========================================================================
        // PRIMARY - Refined Indigo (Material You tonal palette)
        // ==========================================================================
        primary: {
          0: '#000000',
          10: '#041033',
          20: '#091F5C',
          30: '#14318F',
          40: '#2B48BE',      // Container
          50: '#4C71FF',      // Main Primary
          60: '#6B8AFF',      // Hover
          70: '#8CA2FF',      // Light text
          80: '#B0BFFF',      // On container
          90: '#D6DFFF',
          95: '#EBEFFF',
          99: '#FAFBFF',
          100: '#FFFFFF',
          DEFAULT: '#4C71FF',
          foreground: '#0D0D0F',
          container: '#2B48BE',
          'container-foreground': '#B0BFFF',
        },

        // ==========================================================================
        // SECONDARY - Sophisticated Purple
        // ==========================================================================
        secondary: {
          0: '#000000',
          10: '#121721',
          20: '#1F2634',
          30: '#2B3448',
          40: '#373F4E',      // Container
          50: '#555F73',      // Main Secondary
          60: '#6E7B94',      // Hover
          70: '#8899B4',      // Light text
          80: '#AABAD3',      // On container
          90: '#CDD8EB',
          95: '#E4EBF8',
          99: '#F9FBFF',
          100: '#FFFFFF',
          DEFAULT: '#555F73',
          foreground: '#0D0D0F',
          container: '#373F4E',
          'container-foreground': '#AABAD3',
        },

        // ==========================================================================
        // TERTIARY - Refined Teal
        // ==========================================================================
        tertiary: {
          0: '#000000',
          10: '#002020',
          20: '#003737',
          30: '#004F50',
          40: '#00696A',      // Container
          50: '#008585',      // Main Tertiary
          60: '#00A1A3',      // Hover
          70: '#00BDBF',
          80: '#00DBDD',      // On container
          90: '#00F9FB',
          95: '#ADFFFE',
          99: '#F8FFFE',
          100: '#FFFFFF',
          DEFAULT: '#008585',
          foreground: '#FFFFFF',
          container: '#00696A',
          'container-foreground': '#00DBDD',
        },

        // ==========================================================================
        // NEUTRAL - Warm organic grays (Apple-inspired)
        // ==========================================================================
        neutral: {
          0: '#000000',
          4: '#0D0D0F',       // bg-primary
          6: '#111114',
          8: '#151518',       // bg-secondary
          12: '#1C1C20',      // bg-tertiary
          17: '#242429',      // bg-elevated
          22: '#2D2D33',      // quaternary
          30: '#3E3E45',
          40: '#575760',
          50: '#70707B',
          60: '#8A8A95',
          70: '#A5A5B0',
          80: '#C1C1CA',
          87: '#D4D4DB',
          90: '#E3E3E9',
          92: '#E9E9EE',
          94: '#EFEFF3',
          95: '#F2F2F6',
          96: '#F5F5F8',
          98: '#FAFAFC',
          99: '#FDFDFE',
          100: '#FFFFFF',
          DEFAULT: '#70707B',
        },

        // Neutral Variant - For borders/dividers
        'neutral-variant': {
          30: '#41414D',
          50: '#6F6F7B',
          60: '#898995',
          80: '#C4C4D0',
          DEFAULT: '#6F6F7B',
        },

        // ==========================================================================
        // GRAY - Keep for compatibility, map to neutral
        // ==========================================================================
        gray: {
          50: '#FAFAFC',
          100: '#F5F5F8',
          200: '#EFEFF3',
          300: '#E3E3E9',
          400: '#C1C1CA',
          500: '#70707B',
          600: '#575760',
          700: '#3E3E45',
          800: '#242429',
          850: '#1C1C20',
          900: '#151518',
          950: '#0D0D0F',
        },

        // ==========================================================================
        // MATERIAL - Apple material base
        // ==========================================================================
        material: {
          DEFAULT: '#252529',
          50: 'rgba(37, 37, 41, 0.50)',   // ultra-thin
          64: 'rgba(37, 37, 41, 0.64)',   // thin
          78: 'rgba(37, 37, 41, 0.78)',   // regular
          88: 'rgba(37, 37, 41, 0.88)',   // thick
          96: 'rgba(37, 37, 41, 0.96)',   // ultra-thick
        },

        // ==========================================================================
        // SEMANTIC COLORS
        // ==========================================================================
        // Error - Refined red
        error: {
          0: '#000000',
          10: '#410002',
          20: '#690005',
          30: '#93000A',
          40: '#BA1A1A',      // Container
          50: '#DE3730',      // Main Error
          60: '#FF5449',      // Hover
          70: '#FF897D',      // Light text
          80: '#FFB4AB',      // On container
          90: '#FFDAD6',
          95: '#FFEDEA',
          99: '#FFFBFF',
          100: '#FFFFFF',
          DEFAULT: '#DE3730',
          foreground: '#FFFFFF',
          container: '#BA1A1A',
          'container-foreground': '#FFB4AB',
        },

        // Success - Organic green
        success: {
          40: '#1D5C38',
          50: '#367851',
          60: '#50956A',      // Main
          80: '#8FDCA9',      // Light
          90: '#AAF9C4',
          DEFAULT: '#50956A',
          foreground: '#FFFFFF',
        },

        // Warning - Warm amber
        warning: {
          40: '#785900',
          50: '#937100',
          60: '#B08B00',      // Main
          80: '#F5C400',      // Light
          90: '#FFE16F',
          DEFAULT: '#B08B00',
          foreground: '#000000',
        },

        // Info - Cool blue
        info: {
          40: '#004C6F',
          50: '#006690',
          60: '#0080B3',      // Main
          80: '#45C3FF',      // Light
          90: '#BAE6FF',
          DEFAULT: '#0080B3',
          foreground: '#FFFFFF',
        },

        // ==========================================================================
        // LABEL COLORS - Apple Label System
        // ==========================================================================
        label: {
          primary: 'rgba(255, 255, 255, 0.95)',
          secondary: 'rgba(255, 255, 255, 0.70)',
          tertiary: 'rgba(255, 255, 255, 0.50)',
          quaternary: 'rgba(255, 255, 255, 0.25)',
        },
      },

      // ==========================================================================
      // FONT FAMILY
      // ==========================================================================
      fontFamily: {
        display: [
          '"Plus Jakarta Sans"',
          'system-ui',
          'sans-serif',
        ],
        sans: [
          '"Inter"',
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          '"Fira Code"',
          'SF Mono',
          'Menlo',
          'monospace',
        ],
        brand: [
          '"Plus Jakarta Sans"',
          'system-ui',
          'sans-serif',
        ],
      },

      // ==========================================================================
      // FONT SIZE
      // ==========================================================================
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '0.9375rem' }],  // 11px
        'xs': ['0.75rem', { lineHeight: '1rem' }],          // 12px
        'sm': ['0.8125rem', { lineHeight: '1.25rem' }],     // 13px
        'base': ['0.9375rem', { lineHeight: '1.5rem' }],    // 15px - Primary reading
        'lg': ['1.0625rem', { lineHeight: '1.625rem' }],    // 17px
        'xl': ['1.125rem', { lineHeight: '1.75rem' }],      // 18px
        '2xl': ['1.25rem', { lineHeight: '1.75rem' }],      // 20px
        '3xl': ['1.5rem', { lineHeight: '2rem' }],          // 24px
        '4xl': ['2rem', { lineHeight: '2.5rem' }],          // 32px
        '5xl': ['2.5rem', { lineHeight: '3rem' }],          // 40px
      },

      // ==========================================================================
      // LINE HEIGHT
      // ==========================================================================
      lineHeight: {
        'tight': '1.25',
        'snug': '1.375',
        'normal': '1.5',
        'relaxed': '1.65',
        'loose': '2',
      },

      // ==========================================================================
      // SPACING
      // ==========================================================================
      spacing: {
        '0.5': '0.125rem',   // 2px
        '1': '0.25rem',      // 4px
        '1.5': '0.375rem',   // 6px
        '2': '0.5rem',       // 8px
        '2.5': '0.625rem',   // 10px
        '3': '0.75rem',      // 12px
        '3.5': '0.875rem',   // 14px
        '4': '1rem',         // 16px
        '5': '1.25rem',      // 20px
        '6': '1.5rem',       // 24px
        '7': '1.75rem',      // 28px
        '8': '2rem',         // 32px
        '9': '2.25rem',      // 36px
        '10': '2.5rem',      // 40px
        '11': '2.75rem',     // 44px
        '12': '3rem',        // 48px
        '14': '3.5rem',      // 56px
        '16': '4rem',        // 64px
        '18': '4.5rem',      // 72px
        '20': '5rem',        // 80px
        '24': '6rem',        // 96px
      },

      // ==========================================================================
      // BORDER RADIUS
      // ==========================================================================
      borderRadius: {
        'xs': '0.25rem',     // 4px
        'sm': '0.375rem',    // 6px
        'md': '0.5rem',      // 8px
        'lg': '0.75rem',     // 12px
        'xl': '1rem',        // 16px
        '2xl': '1.25rem',    // 20px
        '3xl': '1.5rem',     // 24px
        '4xl': '2rem',       // 32px
      },

      // ==========================================================================
      // BOX SHADOW
      // ==========================================================================
      boxShadow: {
        // Glass materials
        'glass-ultra-thin': '0 1px 2px rgba(0, 0, 0, 0.1)',
        'glass-thin': '0 2px 4px rgba(0, 0, 0, 0.15)',
        'glass': '0 4px 24px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.03)',
        'glass-lg': '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        'glass-xl': '0 12px 48px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06)',

        // Glow effects with refined primary
        'glow': '0 0 30px rgba(107, 110, 240, 0.3)',
        'glow-lg': '0 0 50px rgba(107, 110, 240, 0.4)',
        'glow-sm': '0 0 20px rgba(107, 110, 240, 0.15)',
        'glow-primary': '0 0 30px rgba(107, 110, 240, 0.3)',
        'glow-secondary': '0 0 30px rgba(138, 98, 194, 0.3)',
        'glow-tertiary': '0 0 30px rgba(0, 133, 133, 0.3)',

        // Inner glows
        'inner-glow': 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        'inner-glow-strong': 'inset 0 1px 0 rgba(255, 255, 255, 0.10)',
      },

      // ==========================================================================
      // BACKDROP BLUR (Apple Materials)
      // ==========================================================================
      backdropBlur: {
        'xs': '2px',
        'ultra-thin': '8px',
        'thin': '12px',
        'regular': '20px',
        'thick': '28px',
        'ultra-thick': '40px',
      },

      // ==========================================================================
      // TRANSITION TIMING FUNCTIONS
      // ==========================================================================
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
        'out-back': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'spring': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },

      // ==========================================================================
      // TRANSITION DURATIONS
      // ==========================================================================
      transitionDuration: {
        '75': '75ms',
        '150': '150ms',
        '250': '250ms',
        '350': '350ms',
        '500': '500ms',
      },

      // ==========================================================================
      // ANIMATION
      // ==========================================================================
      animation: {
        'fade-up': 'fadeUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'scale-in': 'scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'slide-in-left': 'slideInLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-in-right': 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-down': 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'typing': 'typing 1s ease-in-out infinite',
        'breathe': 'breathe 4s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
      },

      // ==========================================================================
      // KEYFRAMES
      // ==========================================================================
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(107, 110, 240, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(107, 110, 240, 0.5)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        typing: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        breathe: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.7' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
    },
  },
  plugins: [],
};
