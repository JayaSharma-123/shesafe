/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class', // dark mode is switched by adding class="dark" on <html>
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: { brand: { 50: '#fff1f2', 500: '#e11d48', 600: '#be123c', 700: '#9f1239' } },
    },
  },
  plugins: [],
}