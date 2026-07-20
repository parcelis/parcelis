import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx,mdx}", "./content/**/*.{md,mdx}", "../../packages/ui/src/**/*.{ts,tsx}"],
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
      }
    }
  },
  plugins: []
};

export default config;
