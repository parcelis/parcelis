const visibleJobDataKeys = new Set(["organizationId", "leaseId", "outboxEventId", "eventType", "schemaVersion"]);

const visibleJobOptionKeys = new Set(["attempts", "backoff", "delay", "priority", "removeOnComplete", "removeOnFail"]);

export function sanitizeJobData(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "[redacted]";
  }

  return Object.fromEntries(Object.entries(value).filter(([key]) => visibleJobDataKeys.has(key)));
}

function sanitizeOptions(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "[redacted]";
  }

  return Object.fromEntries(Object.entries(value).filter(([key]) => visibleJobOptionKeys.has(key)));
}

export function sanitizeJobResponse(value: unknown, key?: string): unknown {
  if (key === "data") return sanitizeJobData(value);
  if (key === "opts") return sanitizeOptions(value);
  if (key === "failedReason") return value ? "Job error details redacted" : value;
  if (key === "stacktrace") return Array.isArray(value) ? value.map(() => "Stack trace redacted") : [];
  if (key === "logs") return Array.isArray(value) ? value.map(() => "Log details redacted") : [];
  if (key === "returnValue" || key === "progress") return value == null ? value : "[redacted]";

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJobResponse(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitizeJobResponse(entryValue, entryKey)]),
    );
  }

  return value;
}
