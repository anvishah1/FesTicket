/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#f4f0ff",
          100: "#e7dbff",
          300: "#c0a6ff",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
        },
        accent: "#ffb020"
      },
      boxShadow: {
        "soft-lg": "0 12px 30px rgba(139, 92, 246, 0.12)", // violet-tinted shadow
      },
      borderRadius: {
        lg: "14px"
      }
    },
  },
  plugins: [],
};
