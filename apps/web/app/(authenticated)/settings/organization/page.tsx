import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function OrganizationSettingsPage() {
  const organizationSlug =
    (await headers()).get("x-parcelis-organization-slug") ??
    (await cookies()).get("parcelis-organization-slug")?.value;
  const organizationPath = organizationSlug ? `/o/${encodeURIComponent(organizationSlug)}` : "";
  redirect(`${organizationPath}/settings/organization/general`);
}
