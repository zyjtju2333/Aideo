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
      animation: {
        "in": "in 0.2s ease-out",
        "out": "out 0.2s ease-in",
        "slide-in-bottom": "slide-in-bottom 0.3s ease-out",
        "slide-out-bottom": "slide-out-bottom 0.3s ease-in",
        "scale-in": "scale-in 0.2s ease-out",
      },
      keyframes: {
        in: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        out: {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        "slide-in-bottom": {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
        "slide-out-bottom": {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(100%)" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
