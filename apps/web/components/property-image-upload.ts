import { apiClient } from "./api-client";
import { assertImageFileSize, isSupportedImageType, uploadPresignedFile, type ImageContentType } from "./image-upload";

export function isSupportedPropertyImage(file: File) {
  return isSupportedImageType(file);
}

export async function uploadPropertyImage(propertyId: number, file: File) {
  if (!isSupportedPropertyImage(file)) {
    throw new Error("Choose a GIF, JPG, PNG, or WebP image.");
  }
  assertImageFileSize(file);

  const { fields, objectKey, uploadUrl } = await apiClient.properties.createImageUploadUrl.mutate({
    contentType: file.type as ImageContentType,
    fileSize: file.size,
    fileName: file.name,
    id: propertyId,
  });
  await uploadPresignedFile(file, { fields, uploadUrl }, "The property image could not be uploaded.");

  await apiClient.properties.completeImageUpload.mutate({
    id: propertyId,
    objectKey,
  });
}

export function deletePropertyImage(propertyId: number) {
  return apiClient.properties.deleteImage.mutate({ id: propertyId });
}
