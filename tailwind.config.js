/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cave: {
          950: '#0a0514',
          900: '#120a24',
          800: '#1a0a2e',
          700: '#251540',
          600: '#2f1f50',
          500: '#3d2a66',
        },
        gold: {
          DEFAULT: '#ffd700',
          light: '#ffe44d',
          dark: '#b8960a',
        },
        gem: {
          ruby: '#e0115f',
          emerald: '#50c878',
          sapphire: '#0f52ba',
          amethyst: '#9b59b6',
          topaz: '#ffbf00',
          diamond: '#b9f2ff',
        },
      },
      animation: {
        'gem-pop': 'gemPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'sparkle': 'sparkle 1s ease-in-out',
        'gem-glow': 'gemGlow 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'dragon-bounce': 'dragonBounce 0.6s ease',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        'starburst': 'starburst 2.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'chest-bounce': 'chestBounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'gem-rain': 'gemRain 0.8s ease-in forwards',
        'celebration-in': 'celebrationIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'celebration-out': 'celebrationOut 0.3s ease-in forwards',
      },
      keyframes: {
        gemPop: {
          '0%': { transform: 'scale(0) rotate(-180deg)', opacity: '0' },
          '60%': { transform: 'scale(1.3) rotate(10deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
        sparkle: {
          '0%': { filter: 'brightness(1) drop-shadow(0 0 0 transparent)' },
          '50%': { filter: 'brightness(1.8) drop-shadow(0 0 12px rgba(255,215,0,0.8))' },
          '100%': { filter: 'brightness(1) drop-shadow(0 0 0 transparent)' },
        },
        gemGlow: {
          '0%, 100%': { filter: 'drop-shadow(0 0 4px rgba(255,215,0,0.3))' },
          '50%': { filter: 'drop-shadow(0 0 12px rgba(255,215,0,0.7))' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        dragonBounce: {
          '0%': { transform: 'scale(1)' },
          '30%': { transform: 'scale(1.15)' },
          '60%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        starburst: {
          '0%': { transform: 'scale(0)', opacity: '0.8', filter: 'brightness(2)' },
          '15%': { transform: 'scale(0.3)', opacity: '1', filter: 'brightness(1.8)' },
          '40%': { transform: 'scale(1.3)', opacity: '1', filter: 'brightness(1.2)' },
          '60%': { transform: 'scale(1.6)', opacity: '0.9', filter: 'brightness(1)' },
          '80%': { transform: 'scale(1.8)', opacity: '0.4', filter: 'brightness(0.9)' },
          '100%': { transform: 'scale(2)', opacity: '0', filter: 'brightness(0.8)' },
        },
        chestBounce: {
          '0%': { transform: 'scale(1)' },
          '30%': { transform: 'scale(1.2)' },
          '60%': { transform: 'scale(0.9)' },
          '100%': { transform: 'scale(1)' },
        },
        gemRain: {
          '0%': { transform: 'translateY(-40px) scale(0.5)', opacity: '0' },
          '30%': { opacity: '1' },
          '100%': { transform: 'translateY(0) scale(1)', opacity: '0.8' },
        },
        celebrationIn: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        celebrationOut: {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(0.9)', opacity: '0' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
