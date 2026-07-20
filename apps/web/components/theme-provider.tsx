"use client";

import * as React from "react";

export type ThemeMode = "light" | "dark" | "system";

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  resolvedMode: "light" | "dark";
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function getSystemMode() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(mode: ThemeMode) {
  const resolvedMode = mode === "system" ? getSystemMode() : mode;
  document.documentElement.classList.toggle("dark", resolvedMode === "dark");
  document.documentElement.style.colorScheme = resolvedMode;
  return resolvedMode;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<ThemeMode>("system");
  const [resolvedMode, setResolvedMode] = React.useState<"light" | "dark">("light");

  React.useEffect(() => {
    const savedMode = window.localStorage.getItem("parcelis-theme") as ThemeMode | null;
    const initialMode = savedMode ?? "system";
    setModeState(initialMode);
    setResolvedMode(applyTheme(initialMode));
  }, []);

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (mode === "system") {
        setResolvedMode(applyTheme("system"));
      }
    };

    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [mode]);

  function setMode(nextMode: ThemeMode) {
    window.localStorage.setItem("parcelis-theme", nextMode);
    setModeState(nextMode);
    setResolvedMode(applyTheme(nextMode));
  }

  return (
    <ThemeContext.Provider value={{ mode, setMode, resolvedMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return context;
}
