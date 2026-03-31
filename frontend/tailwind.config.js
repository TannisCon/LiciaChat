/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        breathing: {
          '0%, 100%': {
            boxShadow: '0 0 1px rgba(59, 130, 246, 0.9), 0 0 2px rgba(59, 130, 246, 0.7)',
          },
          '50%': {
            boxShadow: '0 0 3px rgba(59, 130, 246, 1), 0 0 6px rgba(59, 130, 246, 0.9), 0 0 10px rgba(59, 130, 246, 0.8)',
          },
        },
      },
      animation: {
        breathing: 'breathing 2s ease-in-out infinite',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
