import { imageUploadMaxSizeBytes, imageUploadMaxSizeMessage } from "@parcelis/schemas";

export const imageContentTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const standardImageContentTypes = imageContentTypes.slice(0, 3);

export type ImageContentType = (typeof imageContentTypes)[number];

export function isSupportedImageType(file: File, acceptedTypes: readonly string[] = imageContentTypes) {
  return acceptedTypes.includes(file.type);
}

export function assertImageFileSize(file: File) {
  if (file.size > imageUploadMaxSizeBytes) throw new Error(imageUploadMaxSizeMessage);
}

export async function uploadPresignedFile(
  file: File,
  upload: { fields: Record<string, string>; uploadUrl: string },
  errorMessage: string,
) {
  assertImageFileSize(file);
  const formData = new FormData();
  for (const [name, value] of Object.entries(upload.fields)) formData.append(name, value);
  formData.append("file", file);
  const response = await fetch(upload.uploadUrl, { body: formData, method: "POST" });

  if (!response.ok) throw new Error(errorMessage);
}
