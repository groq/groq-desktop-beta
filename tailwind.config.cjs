/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#f55036",
        'user-message-bg': '#222326',
        'custom-dark-bg': '#121418',
      },
    },
  },
  plugins: [],
}; 