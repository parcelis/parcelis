export const imageContentTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const standardImageContentTypes = imageContentTypes.slice(0, 3);

export type ImageContentType = (typeof imageContentTypes)[number];

export function isSupportedImageType(file: File, acceptedTypes: readonly string[] = imageContentTypes) {
  return acceptedTypes.includes(file.type);
}

export async function uploadPresignedFile(file: File, uploadUrl: string, errorMessage: string) {
  const response = await fetch(uploadUrl, {
    body: file,
    headers: { "Content-Type": file.type },
    method: "PUT",
  });

  if (!response.ok) throw new Error(errorMessage);
}
