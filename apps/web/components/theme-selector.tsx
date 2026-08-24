"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

const themes = [
  { mode: "light", label: "Light", icon: Sun },
  { mode: "dark", label: "Dark", icon: Moon },
  { mode: "system", label: "System", icon: Monitor },
] as const;

type ThemeSelectorProps = {
  compact?: boolean;
};

export function ThemeSelector({ compact = false }: ThemeSelectorProps) {
  const { theme, setTheme } = useTheme();

  if (compact) {
    const currentTheme = themes.find((t) => t.mode === theme) ?? themes[0]!;
    const currentThemeIndex = themes.indexOf(currentTheme);
    const nextTheme = themes[(currentThemeIndex + 1) % themes.length]!;
    const Icon = currentTheme.icon;

    return (
      <button
        aria-label="Cycle theme"
        className="grid h-10 w-full place-items-center rounded-md border border-parcelis-border text-parcelis-gray hover:bg-parcelis-porcelain"
        onClick={() => setTheme(nextTheme.mode)}
        title={`Theme: ${currentTheme.label}`}
        type="button"
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div
      aria-label="Theme"
      className="grid grid-cols-3 gap-1 rounded-md border border-parcelis-border bg-parcelis-porcelain p-1"
      role="group"
    >
      {themes.map(({ mode: themeMode, label, icon: Icon }) => (
        <button
          aria-label={`${label} theme`}
          aria-pressed={theme === themeMode}
          className={`grid h-8 w-8 place-items-center rounded text-xs font-semibold ${
            theme === themeMode ? "bg-white text-parcelis-charcoal shadow-sm" : "text-parcelis-gray hover:bg-white/60"
          }`}
          key={themeMode}
          onClick={() => setTheme(themeMode)}
          title={label}
          type="button"
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
