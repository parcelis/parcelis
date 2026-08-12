"use client";

import { Toaster } from "sonner";
import { useTheme } from "./theme-provider";

export function ToastProvider() {
  const { resolvedMode } = useTheme();

  return <Toaster position="top-center" theme={resolvedMode} />;
}
