import { createHash } from "node:crypto";
import { isIP } from "node:net";

const MAX_ACTION_LENGTH = 80;
const MAX_RESOURCE_IDENTITY_LENGTH = 256;
const MAX_REQUEST_IDENTITY_LENGTH = 128;

function normalizedPart(value: string, maxLength: number, label: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${label} is invalid`);
  }
  return normalized;
}

export function createRateLimitKey(input: {
  action: string;
  resourceIdentity: string;
  requestIdentity?: string;
}) {
  const action = normalizedPart(input.action, MAX_ACTION_LENGTH, "Rate-limit action");
  const resourceIdentity = normalizedPart(
    input.resourceIdentity,
    MAX_RESOURCE_IDENTITY_LENGTH,
    "Rate-limit resource identity",
  );
  const requestIdentity = input.requestIdentity
    ? normalizedPart(input.requestIdentity, MAX_REQUEST_IDENTITY_LENGTH, "Rate-limit request identity")
    : null;

  return createHash("sha256")
    .update(JSON.stringify([action, resourceIdentity, requestIdentity]))
    .digest("hex");
}

export function extractClientIp(...headerValues: Array<string | null | undefined>) {
  for (const headerValue of headerValues) {
    if (!headerValue) continue;
    let candidate = headerValue.split(",", 1)[0]?.trim() ?? "";
    if (candidate.startsWith("[") && candidate.endsWith("]")) {
      candidate = candidate.slice(1, -1);
    }
    if (candidate.length <= 64 && isIP(candidate)) return candidate.toLowerCase();
  }
  return undefined;
}
