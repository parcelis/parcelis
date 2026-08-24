"use client";

import * as React from "react";
import { Toaster } from "sonner";
import { useTheme } from "next-themes";

export function ToastProvider() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Toaster
      position="top-center"
      theme={(mounted ? (resolvedTheme as "light" | "dark" | undefined) : "light") ?? "light"}
    />
  );
}
