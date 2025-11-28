/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    screens: {
      xs: "360px",
      sm: "480px",
      md: "600px",
    },
    extend: {
      colors: {
        background: "#F7F7F5",
        foreground: "#37352F",
      },
    },
  },
  plugins: [],
};
