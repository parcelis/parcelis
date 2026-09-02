export const emailColors = {
  border: "#dce1dc",
  charcoal: "#101c29",
  gray: "#586273",
  green: "#6fa640",
  porcelain: "#f7f8f6",
  slate: "#172635",
  white: "#ffffff",
} as const;

export const emailDarkColors = {
  border: "#35464a",
  mutedText: "#b6babc",
  surface: emailColors.slate,
  text: emailColors.porcelain,
} as const;
