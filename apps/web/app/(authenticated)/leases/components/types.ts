import type { apiClient } from "@/components/api-client";

export type LeaseRowProps = {
  canView: boolean;
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
  draftKey?: string;
  lease: Awaited<ReturnType<typeof apiClient.properties.list.query>>[number]["leases"][number] & {
    property: Awaited<ReturnType<typeof apiClient.properties.list.query>>[number];
  };
};
