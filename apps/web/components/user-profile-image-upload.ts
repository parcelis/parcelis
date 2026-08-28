import { apiClient } from "./api-client";
import { assertImageFileSize, isSupportedImageType, uploadPresignedFile, type ImageContentType } from "./image-upload";

export async function uploadUserProfileImage(userId: number, file: File) {
  if (!isSupportedImageType(file)) {
    throw new Error("Choose a GIF, JPG, PNG, or WebP image.");
  }
  assertImageFileSize(file);
  const { fields, objectKey, uploadUrl } = await apiClient.users.createProfileImageUploadUrl.mutate({
    contentType: file.type as ImageContentType,
    fileSize: file.size,
    fileName: file.name,
    id: userId,
  });
  await uploadPresignedFile(file, { fields, uploadUrl }, "The profile photo could not be uploaded.");
  await apiClient.users.completeProfileImageUpload.mutate({ id: userId, objectKey });
}

export function deleteUserProfileImage(userId: number) {
  return apiClient.users.deleteProfileImage.mutate({ id: userId });
}
