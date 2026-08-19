import type { RegisterableHotkey } from "@tanstack/react-hotkeys";

export type ShortcutDefinition = {
  description: string;
  keys: RegisterableHotkey;
};

export const shortcuts = {
  toggleSidebar: { description: "Toggle sidebar", keys: "Mod+B" },
  toggleDarkMode: { description: "Toggle dark mode", keys: "Mod+Shift+D" },
  focusSearch: { description: "Focus search", keys: "/" },
  togglePropertyDrawer: { description: "Open/edit property", keys: "Mod+Shift+P" },
  submitForm: { description: "Save form", keys: "Mod+Enter" },
} as const satisfies Record<string, ShortcutDefinition>;

export const shortcutList: ShortcutDefinition[] = Object.values(shortcuts);

const KEY_LABELS: Record<string, { mac: string; other: string }> = {
  Mod: { mac: "⌘", other: "Ctrl" },
  Shift: { mac: "⇧", other: "Shift" },
  Alt: { mac: "⌥", other: "Alt" },
  Enter: { mac: "⏎", other: "Enter" },
};

export function isMacPlatform() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent);
}

export function shortcutKeyParts(keys: RegisterableHotkey, isMac: boolean): string[] {
  return (keys as string).split("+").map((key) => KEY_LABELS[key]?.[isMac ? "mac" : "other"] ?? key);
}
