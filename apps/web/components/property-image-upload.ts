import { apiClient } from "./api-client";

const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function isSupportedPropertyImage(file: File) {
  return supportedImageTypes.has(file.type);
}

export async function uploadPropertyImage(propertyId: number, file: File) {
  if (!isSupportedPropertyImage(file)) {
    throw new Error("Choose a GIF, JPG, PNG, or WebP image.");
  }

  const { objectKey, uploadUrl } = await apiClient.properties.createImageUploadUrl.mutate({
    contentType: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
    fileName: file.name,
    id: propertyId,
  });
  const response = await fetch(uploadUrl, {
    body: file,
    headers: { "Content-Type": file.type },
    method: "PUT",
  });

  if (!response.ok) {
    throw new Error("The property image could not be uploaded.");
  }

  await apiClient.properties.completeImageUpload.mutate({
    id: propertyId,
    objectKey,
  });
}

export function deletePropertyImage(propertyId: number) {
  return apiClient.properties.deleteImage.mutate({ id: propertyId });
}
