/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', 'sans-serif'],
        logo: ['Gugi', 'cursive'],
      },
      colors: {
        ink: '#0a0a0a',
        brand: {
          DEFAULT: '#ec4899',
          50: '#fdf2f8',
          100: '#fce7f3',
          200: '#fbcfe8',
          500: '#ec4899',
          600: '#db2777',
          700: '#be185d',
        },
      },
      backgroundImage: {
        tinder: 'linear-gradient(135deg, #f472b6 0%, #ec4899 50%, #db2777 100%)',
        'tinder-soft': 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)',
      },
      boxShadow: {
        tinder: '0 10px 30px -10px rgba(236, 72, 153, 0.5)',
        card: '0 24px 60px -20px rgba(0, 0, 0, 0.25)',
      },
    },
  },
  plugins: [],
};
