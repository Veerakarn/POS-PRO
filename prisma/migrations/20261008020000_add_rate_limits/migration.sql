CREATE TABLE "RateLimitBucket" (
  "keyHash" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "blockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("keyHash"),
  CONSTRAINT "RateLimitBucket_count_check" CHECK ("count" > 0)
);

CREATE INDEX "RateLimitBucket_action_updatedAt_idx" ON "RateLimitBucket"("action", "updatedAt");
