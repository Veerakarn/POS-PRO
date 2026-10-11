import "server-only";

import { createHash, randomBytes } from "node:crypto";

export function createPrintAgentToken() {
  return `pospro_${randomBytes(32).toString("base64url")}`;
}

export function hashPrintAgentToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  return token.length >= 32 && token.length <= 200 ? token : null;
}
