import { apiClient } from "./api-client";

const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isSupportedTenantImage(file: File) {
  return supportedImageTypes.has(file.type);
}

export async function uploadTenantImage(tenantId: number, file: File) {
  if (!isSupportedTenantImage(file)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }

  const { objectKey, uploadUrl } = await apiClient.tenants.createImageUploadUrl.mutate({
    contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
    fileName: file.name,
    id: tenantId,
  });
  const response = await fetch(uploadUrl, {
    body: file,
    headers: { "Content-Type": file.type },
    method: "PUT",
  });

  if (!response.ok) {
    throw new Error("The tenant image could not be uploaded.");
  }

  await apiClient.tenants.completeImageUpload.mutate({ id: tenantId, objectKey });
}

export function deleteTenantImage(tenantId: number) {
  return apiClient.tenants.deleteImage.mutate({ id: tenantId });
}
