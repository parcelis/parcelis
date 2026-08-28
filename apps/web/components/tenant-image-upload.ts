import { apiClient } from "./api-client";
import {
  assertImageFileSize,
  imageContentTypes,
  isSupportedImageType,
  uploadPresignedFile,
  type ImageContentType,
} from "./image-upload";

export function isSupportedTenantImage(file: File) {
  return isSupportedImageType(file, imageContentTypes);
}

export async function uploadTenantImage(tenantId: number, file: File) {
  if (!isSupportedTenantImage(file)) {
    throw new Error("Choose a JPG, PNG, WebP, or GIF image.");
  }
  assertImageFileSize(file);

  const { fields, objectKey, uploadUrl } = await apiClient.tenants.createImageUploadUrl.mutate({
    contentType: file.type as ImageContentType,
    fileSize: file.size,
    fileName: file.name,
    id: tenantId,
  });
  await uploadPresignedFile(file, { fields, uploadUrl }, "The tenant image could not be uploaded.");

  await apiClient.tenants.completeImageUpload.mutate({ id: tenantId, objectKey });
}

export function deleteTenantImage(tenantId: number) {
  return apiClient.tenants.deleteImage.mutate({ id: tenantId });
}
