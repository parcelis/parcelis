import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

export type ObjectStorageConfig = {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  publicEndpoint: string;
  region: string;
  secretAccessKey: string;
};

export function getObjectStorageConfig(): ObjectStorageConfig {
  const endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9001";

  return {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? process.env.MINIO_ROOT_USER ?? "parcelis-minio",
    bucket: process.env.S3_BUCKET ?? process.env.MINIO_BUCKET ?? "parcelis-images",
    endpoint,
    publicEndpoint:
      process.env.S3_PUBLIC_ENDPOINT ?? process.env.NEXT_PUBLIC_S3_URL ?? endpoint,
    region: process.env.S3_REGION ?? "us-east-1",
    secretAccessKey:
      process.env.S3_SECRET_ACCESS_KEY ?? process.env.MINIO_ROOT_PASSWORD ?? "parcelis-minio-secret",
  };
}

export function getPublicObjectStorageConfig() {
  const config = getObjectStorageConfig();

  return {
    bucket: config.bucket,
    endpoint: config.publicEndpoint,
    region: config.region,
  };
}

function createObjectStorageClient() {
  const config = getObjectStorageConfig();

  return new S3Client({
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    endpoint: config.endpoint,
    forcePathStyle: true,
    region: config.region,
  });
}

const imageExtensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
} as const;

export function createPropertyImageObjectKey(contentType: keyof typeof imageExtensions, organizationId: number, propertyId: number) {
  return `organizations/${organizationId}/properties/${propertyId}/images/${randomUUID()}.${imageExtensions[contentType]}`;
}

export function createOrganizationAvatarObjectKey(contentType: keyof typeof imageExtensions, organizationId: number) {
  return `organizations/${organizationId}/avatar/${randomUUID()}.${imageExtensions[contentType]}`;
}

export async function createOrganizationAvatarUploadUrl(contentType: keyof typeof imageExtensions, organizationId: number) {
  const config = getObjectStorageConfig();
  const objectKey = createOrganizationAvatarObjectKey(contentType, organizationId);
  const uploadUrl = await getSignedUrl(
    createObjectStorageClient(),
    new PutObjectCommand({ Bucket: config.bucket, ContentType: contentType, Key: objectKey }),
    { expiresIn: 10 * 60 },
  );
  return { objectKey, uploadUrl };
}

export async function createPropertyImageUploadUrl(contentType: keyof typeof imageExtensions, organizationId: number, propertyId: number) {
  const config = getObjectStorageConfig();
  const objectKey = createPropertyImageObjectKey(contentType, organizationId, propertyId);
  const uploadUrl = await getSignedUrl(
    createObjectStorageClient(),
    new PutObjectCommand({
      Bucket: config.bucket,
      ContentType: contentType,
      Key: objectKey,
    }),
    { expiresIn: 10 * 60 },
  );

  return { objectKey, uploadUrl };
}

export async function createPropertyImageDownloadUrl(objectKey: string | null) {
  if (!objectKey) {
    return null;
  }

  const config = getObjectStorageConfig();
  return getSignedUrl(createObjectStorageClient(), new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }), {
    expiresIn: 60 * 60,
  });
}

export async function deletePropertyImageObject(objectKey: string) {
  const config = getObjectStorageConfig();
  await createObjectStorageClient().send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }));
}

export function createTenantImageObjectKey(contentType: keyof typeof imageExtensions, organizationId: number, tenantId: number) {
  return `organizations/${organizationId}/tenants/${tenantId}/images/${randomUUID()}.${imageExtensions[contentType]}`;
}

export async function createTenantImageUploadUrl(contentType: keyof typeof imageExtensions, organizationId: number, tenantId: number) {
  const config = getObjectStorageConfig();
  const objectKey = createTenantImageObjectKey(contentType, organizationId, tenantId);
  const uploadUrl = await getSignedUrl(
    createObjectStorageClient(),
    new PutObjectCommand({
      Bucket: config.bucket,
      ContentType: contentType,
      Key: objectKey,
    }),
    { expiresIn: 10 * 60 },
  );

  return { objectKey, uploadUrl };
}

export const createTenantImageDownloadUrl = createPropertyImageDownloadUrl;
export const deleteTenantImageObject = deletePropertyImageObject;

export function createMaintenanceImageObjectKey(contentType: keyof typeof imageExtensions, organizationId: number, ticketId: number) {
  return `organizations/${organizationId}/maintenance/${ticketId}/images/${randomUUID()}.${imageExtensions[contentType]}`;
}

export async function createMaintenanceImageUploadUrl(contentType: keyof typeof imageExtensions, organizationId: number, ticketId: number) {
  const config = getObjectStorageConfig();
  const objectKey = createMaintenanceImageObjectKey(contentType, organizationId, ticketId);
  const uploadUrl = await getSignedUrl(
    createObjectStorageClient(),
    new PutObjectCommand({ Bucket: config.bucket, ContentType: contentType, Key: objectKey }),
    { expiresIn: 10 * 60 },
  );

  return { objectKey, uploadUrl };
}

export const createMaintenanceImageDownloadUrl = createPropertyImageDownloadUrl;
export const deleteMaintenanceImageObject = deletePropertyImageObject;
