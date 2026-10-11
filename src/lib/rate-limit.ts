import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { createRateLimitKey } from "@/lib/rate-limit-key";

type RateLimitRow = {
  count: number;
  blockedUntil: Date | null;
};

export async function consumeRateLimit(input: {
  action: string;
  resourceIdentity: string;
  requestIdentity?: string;
  limit: number;
  windowMs: number;
  blockMs: number;
}) {
  if (
    !Number.isSafeInteger(input.limit) || input.limit < 1 ||
    !Number.isSafeInteger(input.windowMs) || input.windowMs < 1 ||
    !Number.isSafeInteger(input.blockMs) || input.blockMs < 1
  ) {
    throw new Error("Rate-limit configuration is invalid");
  }

  const now = new Date();
  const windowThreshold = new Date(now.getTime() - input.windowMs);
  const blockedUntil = new Date(now.getTime() + input.blockMs);
  const expiresAt = new Date(now.getTime() + Math.max(input.windowMs, input.blockMs));
  const keyHash = createRateLimitKey(input);

  await db.$executeRaw(Prisma.sql`
    DELETE FROM "RateLimitBucket"
    WHERE "keyHash" IN (
      SELECT "keyHash"
      FROM "RateLimitBucket"
      WHERE "expiresAt" <= ${now}
      ORDER BY "expiresAt" ASC
      LIMIT 100
    )
  `);

  const rows = await db.$queryRaw<RateLimitRow[]>(Prisma.sql`
    INSERT INTO "RateLimitBucket" ("keyHash", "action", "windowStartedAt", "count", "blockedUntil", "updatedAt", "expiresAt")
    VALUES (${keyHash}, ${input.action}, ${now}, 1, NULL, ${now}, ${expiresAt})
    ON CONFLICT ("keyHash") DO UPDATE SET
      "action" = EXCLUDED."action",
      "windowStartedAt" = CASE
        WHEN "RateLimitBucket"."blockedUntil" > ${now} THEN "RateLimitBucket"."windowStartedAt"
        WHEN "RateLimitBucket"."windowStartedAt" < ${windowThreshold} THEN EXCLUDED."windowStartedAt"
        ELSE "RateLimitBucket"."windowStartedAt"
      END,
      "count" = CASE
        WHEN "RateLimitBucket"."blockedUntil" > ${now} THEN "RateLimitBucket"."count" + 1
        WHEN "RateLimitBucket"."windowStartedAt" < ${windowThreshold} THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "blockedUntil" = CASE
        WHEN "RateLimitBucket"."blockedUntil" > ${now} THEN "RateLimitBucket"."blockedUntil"
        WHEN "RateLimitBucket"."windowStartedAt" < ${windowThreshold} THEN NULL
        WHEN "RateLimitBucket"."count" + 1 > ${input.limit} THEN ${blockedUntil}
        ELSE NULL
      END,
      "updatedAt" = EXCLUDED."updatedAt",
      "expiresAt" = GREATEST("RateLimitBucket"."expiresAt", EXCLUDED."expiresAt")
    RETURNING "count", "blockedUntil"
  `);
  const row = rows[0];
  return {
    allowed: Boolean(row && row.count <= input.limit && (!row.blockedUntil || row.blockedUntil <= now)),
    retryAfterSeconds: row?.blockedUntil
      ? Math.max(1, Math.ceil((row.blockedUntil.getTime() - now.getTime()) / 1000))
      : Math.ceil(input.windowMs / 1000),
  };
}
