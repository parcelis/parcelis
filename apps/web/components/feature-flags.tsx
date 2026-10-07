"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FeatureFlags } from "@parcelis/schemas";

const FeatureFlagsContext = createContext<FeatureFlags>({ applications: false });

export function FeatureFlagsProvider({ flags, children }: { flags: FeatureFlags; children: ReactNode }) {
  return <FeatureFlagsContext.Provider value={flags}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}
