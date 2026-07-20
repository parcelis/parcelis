import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "parcelis-charcoal": "rgb(var(--parcelis-charcoal) / <alpha-value>)",
        "parcelis-green": "rgb(var(--parcelis-green) / <alpha-value>)",
        "parcelis-slate": "rgb(var(--parcelis-slate) / <alpha-value>)",
        "parcelis-gray": "rgb(var(--parcelis-gray) / <alpha-value>)",
        "parcelis-porcelain": "rgb(var(--parcelis-porcelain) / <alpha-value>)",
        "parcelis-white": "rgb(var(--parcelis-white) / <alpha-value>)",
        "parcelis-border": "rgb(var(--parcelis-border) / <alpha-value>)",
        "parcelis-green-hover": "rgb(var(--parcelis-green-hover) / <alpha-value>)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        serif: ["Georgia", "ui-serif", "serif"]
      }
    }
  },
  plugins: []
};

export default config;
