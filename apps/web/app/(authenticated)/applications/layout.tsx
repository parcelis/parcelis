import { getFeatureFlags } from "@parcelis/schemas";
import { notFound } from "next/navigation";

export default function ApplicationsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!getFeatureFlags(process.env).applications) notFound();
  return children;
}
