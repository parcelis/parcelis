import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "parcelis-charcoal": "rgb(from var(--parcelis-charcoal) r g b / <alpha-value>)",
        "parcelis-green": "rgb(from var(--parcelis-green) r g b / <alpha-value>)",
        "parcelis-slate": "rgb(from var(--parcelis-slate) r g b / <alpha-value>)",
        "parcelis-gray": "rgb(from var(--parcelis-gray) r g b / <alpha-value>)",
        "parcelis-porcelain": "rgb(from var(--parcelis-porcelain) r g b / <alpha-value>)",
        "parcelis-white": "rgb(from var(--parcelis-white) r g b / <alpha-value>)",
        "parcelis-border": "rgb(from var(--parcelis-border) r g b / <alpha-value>)",
        "parcelis-green-hover": "rgb(from var(--parcelis-green-hover) r g b / <alpha-value>)"
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui"],
        serif: ["Georgia", "ui-serif", "serif"]
      }
    }
  },
  plugins: []
};

export default config;
