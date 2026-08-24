"use client";

import * as React from "react";
import { HotkeysProvider, useHotkey, type RegisterableHotkey, type UseHotkeyOptions } from "@tanstack/react-hotkeys";
import { useTheme } from "next-themes";
import { shortcuts } from "./shortcuts";

export type ShortcutKey = RegisterableHotkey;

export function ShortcutProvider({ children }: { children: React.ReactNode }) {
  return (
    <HotkeysProvider
      defaultOptions={{
        hotkey: {
          preventDefault: true,
        },
        hotkeySequence: {
          timeout: 1200,
        },
      }}
    >
      <ThemeShortcuts />
      {children}
    </HotkeysProvider>
  );
}

function ThemeShortcuts() {
  const { resolvedTheme, setTheme } = useTheme();

  useShortcut(shortcuts.toggleDarkMode.keys, () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  });

  return null;
}

export function useShortcut(shortcut: RegisterableHotkey, handler: () => void, options?: UseHotkeyOptions) {
  useHotkey(shortcut, handler, options);
}
