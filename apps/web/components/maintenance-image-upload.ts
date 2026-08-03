import { apiClient } from "./api-client";

const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function uploadMaintenanceImage(ticketId: number, file: File) {
  if (!supportedImageTypes.has(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }

  const contentType = file.type as "image/jpeg" | "image/png" | "image/webp";
  const { objectKey, uploadUrl } = await apiClient.maintenance.createImageUploadUrl.mutate({
    id: ticketId,
    contentType,
    fileName: file.name,
  });
  const response = await fetch(uploadUrl, {
    body: file,
    headers: { "Content-Type": contentType },
    method: "PUT",
  });

  if (!response.ok) {
    throw new Error("The maintenance image could not be uploaded.");
  }

  await apiClient.maintenance.completeImageUpload.mutate({
    id: ticketId,
    objectKey,
    fileName: file.name,
    contentType,
  });
}
