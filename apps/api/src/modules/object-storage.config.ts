export type ObjectStorageConfig = {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  publicEndpoint: string;
  region: string;
  secretAccessKey: string;
};

export function getObjectStorageConfig(): ObjectStorageConfig {
  const endpoint = process.env.OBJECT_STORAGE_ENDPOINT ?? "http://localhost:9000";

  return {
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID ?? process.env.MINIO_ROOT_USER ?? "parcelis-minio",
    bucket: process.env.OBJECT_STORAGE_BUCKET ?? process.env.MINIO_BUCKET ?? "parcelis-images",
    endpoint,
    publicEndpoint: process.env.OBJECT_STORAGE_PUBLIC_ENDPOINT ?? process.env.NEXT_PUBLIC_OBJECT_STORAGE_URL ?? endpoint,
    region: process.env.OBJECT_STORAGE_REGION ?? "us-east-1",
    secretAccessKey:
      process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY ?? process.env.MINIO_ROOT_PASSWORD ?? "parcelis-minio-secret",
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
