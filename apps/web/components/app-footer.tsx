"use client";

import { BookOpen, ExternalLink } from "lucide-react";
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
          <a
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-parcelis-border bg-white px-2.5 font-medium leading-none text-parcelis-charcoal transition hover:border-parcelis-green hover:text-parcelis-green dark:bg-parcelis-slate"
            href="/docs/"
            rel="noopener noreferrer"
            target="_blank"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Documentation Site
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </footer>
  );
}
