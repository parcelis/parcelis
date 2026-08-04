export function AppFooter() {
  return (
    <footer className="border-t border-parcelis-border bg-white/80 px-4 py-4 text-xs text-parcelis-gray backdrop-blur dark:bg-parcelis-slate/80 lg:ml-[var(--parcelis-sidebar-width)] lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span>© {new Date().getFullYear()} Parcelis. All rights reserved.</span>
        <span>Property management for modern teams.</span>
      </div>
    </footer>
  );
}
