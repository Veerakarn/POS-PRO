ALTER TABLE "Refund" ADD COLUMN "cashShiftId" TEXT;

CREATE INDEX "Refund_cashShiftId_status_idx" ON "Refund"("cashShiftId", "status");

ALTER TABLE "Refund"
ADD CONSTRAINT "Refund_cashShiftId_fkey"
FOREIGN KEY ("cashShiftId") REFERENCES "CashShift"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_refund_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Bill" bill
    JOIN "Payment" payment ON payment."id" = NEW."paymentId" AND payment."billId" = bill."id"
    WHERE bill."id" = NEW."billId" AND bill."branchId" = NEW."branchId"
  ) THEN
    RAISE EXCEPTION 'Refund bill, payment and branch do not match';
  END IF;

  IF NEW."cashShiftId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "CashShift" shift
    WHERE shift."id" = NEW."cashShiftId"
      AND shift."branchId" = NEW."branchId"
      AND shift."status" = 'OPEN'
  ) THEN
    RAISE EXCEPTION 'Refund shift must be open and match refund branch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER "Refund_integrity" ON "Refund";

CREATE TRIGGER "Refund_integrity"
BEFORE INSERT OR UPDATE OF "branchId", "billId", "paymentId", "cashShiftId" ON "Refund"
FOR EACH ROW EXECUTE FUNCTION enforce_refund_integrity();
