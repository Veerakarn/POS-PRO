-- Consolidate any active sessions created before the database enforced one
-- active session per table. Prefer the session already in payment, then the
-- most recently opened session, and preserve every related business record.
BEGIN;

CREATE TEMP TABLE "ActiveTableSessionMerge" ON COMMIT DROP AS
SELECT "duplicateId", "keeperId"
FROM (
  SELECT
    session."id" AS "duplicateId",
    FIRST_VALUE(session."id") OVER (
      PARTITION BY session."tableId"
      ORDER BY
        CASE session."status"
          WHEN 'PAYMENT_IN_PROGRESS' THEN 3
          WHEN 'CHECK_REQUESTED' THEN 2
          ELSE 1
        END DESC,
        session."openedAt" DESC,
        session."createdAt" DESC,
        session."id" DESC
    ) AS "keeperId",
    ROW_NUMBER() OVER (
      PARTITION BY session."tableId"
      ORDER BY
        CASE session."status"
          WHEN 'PAYMENT_IN_PROGRESS' THEN 3
          WHEN 'CHECK_REQUESTED' THEN 2
          ELSE 1
        END DESC,
        session."openedAt" DESC,
        session."createdAt" DESC,
        session."id" DESC
    ) AS "sessionRank"
  FROM "TableSession" session
  WHERE session."status" IN ('OPEN', 'CHECK_REQUESTED', 'PAYMENT_IN_PROGRESS')
) ranked
WHERE ranked."sessionRank" > 1;

UPDATE "Order" ordering
SET "tableSessionId" = merge."keeperId"
FROM "ActiveTableSessionMerge" merge
WHERE ordering."tableSessionId" = merge."duplicateId";

UPDATE "Bill" bill
SET "tableSessionId" = merge."keeperId"
FROM "ActiveTableSessionMerge" merge
WHERE bill."tableSessionId" = merge."duplicateId";

UPDATE "ServiceRequest" request
SET "tableSessionId" = merge."keeperId"
FROM "ActiveTableSessionMerge" merge
WHERE request."tableSessionId" = merge."duplicateId";

UPDATE "TableSession" session
SET
  "status" = 'CLOSED',
  "closedAt" = COALESCE(session."closedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
FROM "ActiveTableSessionMerge" merge
WHERE session."id" = merge."duplicateId";

UPDATE "TableSession"
SET "closedAt" = NULL
WHERE "status" IN ('OPEN', 'CHECK_REQUESTED', 'PAYMENT_IN_PROGRESS')
  AND "closedAt" IS NOT NULL;

CREATE UNIQUE INDEX "TableSession_one_active_per_table_idx"
ON "TableSession"("tableId")
WHERE "status" IN ('OPEN', 'CHECK_REQUESTED', 'PAYMENT_IN_PROGRESS');

-- Buckets carry an explicit expiry so opportunistic cleanup can bound storage.
ALTER TABLE "RateLimitBucket" ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "RateLimitBucket"
SET "expiresAt" = GREATEST(
  "updatedAt" + INTERVAL '1 day',
  COALESCE("blockedUntil", "updatedAt")
);

ALTER TABLE "RateLimitBucket" ALTER COLUMN "expiresAt" SET NOT NULL;

CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

COMMIT;
