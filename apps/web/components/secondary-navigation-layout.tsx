import type { ReactNode } from "react";

type SecondaryNavigationLayoutProps = {
  children: ReactNode;
  className?: string;
  header: ReactNode;
  navigation: ReactNode;
};

export function SecondaryNavigationLayout({
  children,
  className = "gap-6",
  header,
  navigation,
}: SecondaryNavigationLayoutProps) {
  return (
    <div className={`flex flex-col lg:flex-row ${className}`}>
      {navigation}
      <div className="contents lg:block lg:min-w-0 lg:flex-1">
        <div className="order-first *:mb-0 lg:*:mb-6">{header}</div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
