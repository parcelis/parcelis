import { apiClient } from "./api-client";
import {
  assertImageFileSize,
  isSupportedImageType,
  standardImageContentTypes,
  uploadPresignedFile,
  type ImageContentType,
} from "./image-upload";

export async function uploadMaintenanceImage(ticketId: number, file: File) {
  if (!isSupportedImageType(file, standardImageContentTypes)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  assertImageFileSize(file);

  const contentType = file.type as ImageContentType;
  const { fields, objectKey, uploadUrl } = await apiClient.maintenance.createImageUploadUrl.mutate({
    id: ticketId,
    contentType,
    fileSize: file.size,
    fileName: file.name,
  });
  await uploadPresignedFile(file, { fields, uploadUrl }, "The maintenance image could not be uploaded.");

  await apiClient.maintenance.completeImageUpload.mutate({
    id: ticketId,
    objectKey,
    fileName: file.name,
    contentType,
  });
}
