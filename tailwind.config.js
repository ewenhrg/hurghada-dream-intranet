/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        hd: {
          bg: "#f5efe4",
          card: "#ffffff",
          accent: "#b87a3f",
          text: "#2f2a23",
        },
      },
    },
  },
  plugins: [],
};
