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
        // TEMPORARY - Purple/Mauve Palette
        // #DEDCDC - Background (lightest)
        // #C5BAC4 - Form/card backgrounds
        // #6B597F - Navbar, borders
        // #522C5D - Primary accent
        // #29104A - Darkest accent
        primary: {
          50: "#DEDCDC",   // Background
          100: "#C5BAC4",  // Card/form backgrounds
          200: "#6B597F",  // Navbar, borders
          300: "#6B597F",
          400: "#522C5D",  // Primary accent
          500: "#522C5D",  // Main accent
          600: "#29104A",  // Darkest
          700: "#29104A",
          800: "#29104A",
          900: "#29104A",
        },
        // Named colors for easy use
        cream: "#DEDCDC",      // Page background (lightest)
        blush: "#C5BAC4",      // Form/card backgrounds
        rose: "#6B597F",       // Navbar, borders
        grape: "#522C5D",      // Primary accent
        wine: "#522C5D",       // Primary buttons
        midnight: "#29104A",   // Darkest text, strong accents
        accent: "#522C5D",     // Primary accent color
        "form-bg": "#C5BAC4",  // Form background
        // Additional named colors
        navbar: "#6B597F",
        purple: "#522C5D",
        "deep-purple": "#29104A",
      },
      boxShadow: {
        "soft-lg": "0 12px 30px rgba(41, 16, 74, 0.15)",
        "soft-md": "0 6px 20px rgba(41, 16, 74, 0.1)",
        "elegant": "0 10px 40px rgba(41, 16, 74, 0.18)",
        "glow": "0 0 30px rgba(82, 44, 93, 0.3)",
      },
      borderRadius: {
        lg: "14px",
        xl: "20px",
        "2xl": "24px",
      },
      backgroundImage: {
        'gradient-elegant': 'linear-gradient(135deg, #29104A 0%, #522C5D 100%)',
        'gradient-soft': 'linear-gradient(135deg, #DEDCDC 0%, #C5BAC4 100%)',
        'gradient-purple': 'linear-gradient(135deg, #522C5D 0%, #6B597F 100%)',
      }
    },
  },
  plugins: [],
};
