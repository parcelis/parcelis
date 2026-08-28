import { apiClient } from "./api-client";
import {
  isSupportedImageType,
  standardImageContentTypes,
  uploadPresignedFile,
  type ImageContentType,
} from "./image-upload";

export async function uploadMaintenanceImage(ticketId: number, file: File) {
  if (!isSupportedImageType(file, standardImageContentTypes)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }

  const contentType = file.type as ImageContentType;
  const { objectKey, uploadUrl } = await apiClient.maintenance.createImageUploadUrl.mutate({
    id: ticketId,
    contentType,
    fileName: file.name,
  });
  await uploadPresignedFile(file, uploadUrl, "The maintenance image could not be uploaded.");

  await apiClient.maintenance.completeImageUpload.mutate({
    id: ticketId,
    objectKey,
    fileName: file.name,
    contentType,
  });
}
