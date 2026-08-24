"use client";

import { Toaster } from "sonner";
import { useTheme } from "next-themes";

export function ToastProvider() {
  const { resolvedTheme } = useTheme();

  return <Toaster position="top-center" theme={(resolvedTheme ?? "light") as "light" | "dark"} />;
}
