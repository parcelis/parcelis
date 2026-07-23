"use client";

import * as React from "react";
import { HotkeysProvider, useHotkey, type RegisterableHotkey, type UseHotkeyOptions } from "@tanstack/react-hotkeys";
import { useTheme } from "./theme-provider";

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
  const { resolvedMode, setMode } = useTheme();

  useShortcut("Mod+Shift+D", () => {
    setMode(resolvedMode === "dark" ? "light" : "dark");
  });

  return null;
}

export function useShortcut(
  shortcut: RegisterableHotkey,
  handler: () => void,
  options?: UseHotkeyOptions,
) {
  useHotkey(shortcut, handler, options);
}
