import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "parcelis-charcoal": "rgb(var(--parcelis-charcoal-rgb) / <alpha-value>)",
        "parcelis-green": "rgb(var(--parcelis-green-rgb) / <alpha-value>)",
        "parcelis-slate": "rgb(var(--parcelis-slate-rgb) / <alpha-value>)",
        "parcelis-gray": "rgb(var(--parcelis-gray-rgb) / <alpha-value>)",
        "parcelis-porcelain": "rgb(var(--parcelis-porcelain-rgb) / <alpha-value>)",
        "parcelis-white": "rgb(var(--parcelis-white-rgb) / <alpha-value>)",
        "parcelis-border": "rgb(var(--parcelis-border-rgb) / <alpha-value>)",
        "parcelis-green-hover": "rgb(var(--parcelis-green-hover-rgb) / <alpha-value>)"
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
