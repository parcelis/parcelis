"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OrganizationSettingsPage() {
  const router = useRouter();
  useEffect(() => {
    const organizationPath = window.location.pathname.match(/^\/o\/[^/]+/)?.[0] ?? "";
    router.replace(`${organizationPath}/settings/organization/general`);
  }, [router]);
  return null;
}
