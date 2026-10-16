import { getPublicObjectStorageConfig } from "./object-storage.config";

export function getApiHealth() {
  return {
    data: {
      status: "ok",
      service: "parcelis-api",
      objectStorage: getPublicObjectStorageConfig(),
    },
  };
}
