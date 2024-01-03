/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/react-tailwindcss-datepicker/dist/index.esm.js",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#2563EB",
        secondary: "#F1F1F1",
        bg_primary: "#050816",
        "black-100": "#5F6F77",
        "black-200": "#D9D9D9",
      },
      boxShadow: {
        card: "4px 4px 4px 1px rgba(0, 0, 0, 0.25)",
      },
      screens: {
        xs: "450px",
      },
      fontFamily: {
        nunito: ["Nunito", "sans-serif"],
      },
      animation: {
        "spin-slow": "spin 2s linear infinite",
      },
      backgroundImage: {
        "custom-background": "url('/images/background.jpg')",
      },
      boxShadow: {
        "custom-pink": "0px 0px 20px 0px rgba(223, 87, 234, 1)",
        "custom-pink-rb": "5px 5px 20px 0px rgba(223, 87, 234, 1)",
      },
      // 下線の色を追加
      textDecorationColor: {
        "custom-color": "#9775FB", // ここで好きな色を指定
      },
      // 下線の太さを追加
      textDecorationThickness: {
        "1": "1px",
        "2": "2px",
        "3": "3px",
        // 他の太さもここに追加可能
      },
    },
  },
  plugins: [
    // textDecorationColorユーティリティを有効にするためのプラグインを追加
    function({ addUtilities, theme, variants }) {
      const newUtilities = {
        ".underline": {
          textDecoration: "underline",
        },
        ".underline-custom-color": {
          textDecorationColor: theme("textDecorationColor.custom-color"),
        },
        ".underline-thickness-1": { 
          textDecorationThickness: theme("textDecorationThickness.1") 
        },
        ".underline-thickness-2": { 
          textDecorationThickness: theme("textDecorationThickness.2") 
        },
        ".underline-thickness-3": { 
          textDecorationThickness: theme("textDecorationThickness.3") 
        },
        // 他の太さのユーティリティもここに追加
      };
      addUtilities(newUtilities, variants("textDecoration"));
    },
  ],
}

