import colors from "tailwindcss/colors";
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        slate: colors.zinc,
        sky: colors.gray
      },
      fontFamily: {
        sans: [
          "var(--font-manrope)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ]
      }
    }
  },
  plugins: []
};

export default config;

