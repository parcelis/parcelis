import type { ReactNode } from "react";

type SecondaryNavigationLayoutProps = {
  children: ReactNode;
  className?: string;
  gap?: 5 | 6;
  header: ReactNode;
  navigation: ReactNode;
};

export function SecondaryNavigationLayout({
  children,
  className,
  gap = 6,
  header,
  navigation,
}: SecondaryNavigationLayoutProps) {
  return (
    <div className={className}>
      <div className={`relative flex flex-col ${gap === 5 ? "gap-5 lg:pl-65" : "gap-6 lg:pl-66"}`}>
        <div className="min-w-0 *:mb-0">{header}</div>
        <div className="lg:absolute lg:inset-y-0 lg:left-0 lg:w-60 lg:[&>aside]:h-full">
          {navigation}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
