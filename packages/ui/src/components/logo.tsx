"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export function ParcelisLogo({
  className,
  darkLogoSrc,
  logoSrc,
  markOnly = false,
}: {
  className?: string;
  darkLogoSrc?: string;
  logoSrc?: string;
  markOnly?: boolean;
}) {
  const [hasImageError, setHasImageError] = React.useState(false);
  const [isDarkMode, setIsDarkMode] = React.useState(false);
  const imageSrc = isDarkMode ? (darkLogoSrc ?? logoSrc) : (logoSrc ?? darkLogoSrc);

  React.useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setIsDarkMode(root.classList.contains("dark"));
    const observer = new MutationObserver(syncTheme);

    syncTheme();
    observer.observe(root, { attributeFilter: ["class"], attributes: true });
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => setHasImageError(false), [imageSrc]);

  return (
    <div className={cn("flex items-center gap-3", className)} aria-label="Parcelis">
      <div className="grid h-10 w-10 overflow-hidden rounded-md bg-parcelis-charcoal text-parcelis-green shadow-sm">
        {imageSrc && !hasImageError ? (
          <img
            alt=""
            className="h-full w-full object-cover"
            height={80}
            onError={() => setHasImageError(true)}
            src={imageSrc}
            width={80}
          />
        ) : (
          <span className="grid place-items-center font-serif text-xl font-bold tracking-normal">P</span>
        )}
      </div>
      {!markOnly ? (
        <div>
          <div
            className="text-base leading-none"
            style={{
              fontFamily: '"Inter", sans-serif',
              fontSize: "1.75rem",
              fontWeight: 600,
            }}
          >
            <span className="parcelis-wordmark-parcel">Parcel</span>
            <span className="parcelis-wordmark-is">is</span>
          </div>
          {/* <div className="text-[0.68rem] font-medium uppercase tracking-[0.08em] text-parcelis-gray">
            Open Source Property Management
          </div> */}
        </div>
      ) : null}
    </div>
  );
}
