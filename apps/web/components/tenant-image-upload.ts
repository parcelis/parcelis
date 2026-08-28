import { apiClient } from "./api-client";
import {
  isSupportedImageType,
  standardImageContentTypes,
  uploadPresignedFile,
  type ImageContentType,
} from "./image-upload";

export function isSupportedTenantImage(file: File) {
  return isSupportedImageType(file, standardImageContentTypes);
}

export async function uploadTenantImage(tenantId: number, file: File) {
  if (!isSupportedTenantImage(file)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }

  const { objectKey, uploadUrl } = await apiClient.tenants.createImageUploadUrl.mutate({
    contentType: file.type as ImageContentType,
    fileName: file.name,
    id: tenantId,
  });
  await uploadPresignedFile(file, uploadUrl, "The tenant image could not be uploaded.");

  await apiClient.tenants.completeImageUpload.mutate({ id: tenantId, objectKey });
}

export function deleteTenantImage(tenantId: number) {
  return apiClient.tenants.deleteImage.mutate({ id: tenantId });
}
