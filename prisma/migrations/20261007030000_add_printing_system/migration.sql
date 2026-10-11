CREATE TYPE "PrintDocumentType" AS ENUM ('ORDER_TICKET', 'RECEIPT', 'TEST');

ALTER TABLE "PrintAgent"
ADD COLUMN "lastError" TEXT,
ADD COLUMN "version" TEXT;

ALTER TABLE "Printer"
ADD COLUMN "codePage" TEXT NOT NULL DEFAULT 'UTF-8';

ALTER TABLE "PrintJob"
ADD COLUMN "branchId" TEXT,
ADD COLUMN "documentType" "PrintDocumentType" NOT NULL DEFAULT 'TEST',
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "claimedAt" TIMESTAMP(3),
ADD COLUMN "claimExpiresAt" TIMESTAMP(3),
ADD COLUMN "completedAt" TIMESTAMP(3);

UPDATE "PrintJob" AS job
SET "branchId" = printer."branchId",
    "idempotencyKey" = 'legacy:' || job."id"
FROM "Printer" AS printer
WHERE printer."id" = job."printerId";

ALTER TABLE "PrintJob"
ALTER COLUMN "branchId" SET NOT NULL,
ALTER COLUMN "idempotencyKey" SET NOT NULL,
ALTER COLUMN "documentType" DROP DEFAULT;

CREATE TABLE "PrintRoutingRule" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "printerId" TEXT NOT NULL,
  "stationId" TEXT,
  "documentType" "PrintDocumentType" NOT NULL,
  "copies" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrintRoutingRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrintRoutingRule_valid_type_check" CHECK (
    ("documentType" = 'ORDER_TICKET' AND "stationId" IS NOT NULL)
    OR ("documentType" = 'RECEIPT' AND "stationId" IS NULL)
  ),
  CONSTRAINT "PrintRoutingRule_copies_check" CHECK ("copies" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "PrintAgent_branchId_name_key" ON "PrintAgent"("branchId", "name");
CREATE INDEX "PrintAgent_branchId_isActive_idx" ON "PrintAgent"("branchId", "isActive");
CREATE UNIQUE INDEX "Printer_branchId_name_key" ON "Printer"("branchId", "name");
CREATE INDEX "Printer_branchId_isActive_idx" ON "Printer"("branchId", "isActive");
CREATE UNIQUE INDEX "PrintJob_idempotencyKey_key" ON "PrintJob"("idempotencyKey");
CREATE INDEX "PrintJob_branchId_status_createdAt_idx" ON "PrintJob"("branchId", "status", "createdAt");
CREATE UNIQUE INDEX "PrintRoutingRule_printerId_stationId_documentType_key" ON "PrintRoutingRule"("printerId", "stationId", "documentType");
CREATE UNIQUE INDEX "PrintRoutingRule_receipt_printer_key" ON "PrintRoutingRule"("printerId", "documentType") WHERE "stationId" IS NULL;
CREATE INDEX "PrintRoutingRule_branchId_documentType_isActive_idx" ON "PrintRoutingRule"("branchId", "documentType", "isActive");

ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrintRoutingRule" ADD CONSTRAINT "PrintRoutingRule_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrintRoutingRule" ADD CONSTRAINT "PrintRoutingRule_printerId_fkey"
FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrintRoutingRule" ADD CONSTRAINT "PrintRoutingRule_stationId_fkey"
FOREIGN KEY ("stationId") REFERENCES "ProductionStation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_print_tenant_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Printer" printer
    WHERE printer."id" = NEW."printerId" AND printer."branchId" = NEW."branchId"
  ) THEN
    RAISE EXCEPTION 'Print entity branch does not match printer branch';
  END IF;

  IF TG_TABLE_NAME = 'PrintRoutingRule' AND NEW."stationId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ProductionStation" station
    WHERE station."id" = NEW."stationId" AND station."branchId" = NEW."branchId"
  ) THEN
    RAISE EXCEPTION 'Print route branch does not match station branch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PrintJob_tenant_integrity"
BEFORE INSERT OR UPDATE OF "branchId", "printerId" ON "PrintJob"
FOR EACH ROW EXECUTE FUNCTION enforce_print_tenant_integrity();

CREATE TRIGGER "PrintRoutingRule_tenant_integrity"
BEFORE INSERT OR UPDATE OF "branchId", "printerId", "stationId" ON "PrintRoutingRule"
FOR EACH ROW EXECUTE FUNCTION enforce_print_tenant_integrity();
