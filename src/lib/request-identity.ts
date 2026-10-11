import "server-only";

import { headers } from "next/headers";

import { extractClientIp } from "@/lib/rate-limit-key";

export async function getRequestIdentity() {
  const requestHeaders = await headers();
  return extractClientIp(
    requestHeaders.get("x-forwarded-for"),
    requestHeaders.get("x-real-ip"),
  );
}
