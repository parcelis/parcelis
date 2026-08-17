"use client";

import { usePathname } from "next/navigation";

export function AppFooter() {
  const pathname = usePathname();

  if (pathname === "/login") {
    return null;
  }

  return (
    <footer className="border-t border-parcelis-border bg-white/80 px-4 py-1 text-xs text-parcelis-gray backdrop-blur dark:bg-parcelis-slate/80 lg:ml-[var(--parcelis-sidebar-width)] lg:px-8">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="leading-none">
          © {new Date().getFullYear()}{" "}
          <a className="hover:text-parcelis-green" href="https://parcelis.dev">
            Parcelis
          </a>
          . Open source. Open future.
        </span>
        <div className="flex flex-wrap items-center gap-4">
          <span className="leading-none">The open-source platform for property management.</span>
        </div>
      </div>
    </footer>
  );
}
