CREATE TYPE "DiscountKind" AS ENUM ('FIXED', 'PERCENT');
CREATE TYPE "RefundStatus" AS ENUM ('SUCCEEDED', 'VOIDED');
CREATE TYPE "CashShiftStatus" AS ENUM ('OPEN', 'CLOSED');
ALTER TYPE "StockMovementType" ADD VALUE 'REVERSAL';

ALTER TABLE "OrderItem"
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledById" TEXT,
ADD COLUMN "cancellationReason" TEXT,
ADD COLUMN "stockRestored" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Bill"
ADD COLUMN "voidedAt" TIMESTAMP(3),
ADD COLUMN "voidReason" TEXT;

ALTER TABLE "Payment" ADD COLUMN "cashShiftId" TEXT;

DROP INDEX "StockMovement_orderId_ingredientId_key";
CREATE INDEX "StockMovement_orderId_ingredientId_idx" ON "StockMovement"("orderId", "ingredientId");

CREATE TABLE "BillLine" (
  "id" TEXT NOT NULL,
  "billId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "nameSnapshot" TEXT NOT NULL,
  "unitPriceSatang" INTEGER NOT NULL,
  "subtotalSatang" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillLine_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "BillLine_amount_check" CHECK ("unitPriceSatang" >= 0 AND "subtotalSatang" >= 0)
);

CREATE TABLE "OrderItemIngredient" (
  "id" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "unitCostSatang" DECIMAL(18,6),
  "restoredQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderItemIngredient_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderItemIngredient_quantity_check" CHECK ("quantity" >= 0 AND "restoredQuantity" >= 0 AND "restoredQuantity" <= "quantity")
);

CREATE TABLE "BillDiscount" (
  "id" TEXT NOT NULL,
  "billId" TEXT NOT NULL,
  "billLineId" TEXT,
  "kind" "DiscountKind" NOT NULL,
  "value" INTEGER NOT NULL,
  "amountSatang" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillDiscount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillDiscount_value_check" CHECK (
    ("kind" = 'FIXED' AND "value" > 0)
    OR ("kind" = 'PERCENT' AND "value" BETWEEN 1 AND 10000)
  ),
  CONSTRAINT "BillDiscount_amount_check" CHECK ("amountSatang" > 0)
);

CREATE TABLE "Refund" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "billId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "amountSatang" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "status" "RefundStatus" NOT NULL DEFAULT 'SUCCEEDED',
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Refund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Refund_amount_check" CHECK ("amountSatang" > 0)
);

CREATE TABLE "CashShift" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "CashShiftStatus" NOT NULL DEFAULT 'OPEN',
  "openingCashSatang" INTEGER NOT NULL,
  "expectedCashSatang" INTEGER,
  "closingCashSatang" INTEGER,
  "differenceSatang" INTEGER,
  "note" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "CashShift_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashShift_opening_check" CHECK ("openingCashSatang" >= 0),
  CONSTRAINT "CashShift_closing_check" CHECK ("closingCashSatang" IS NULL OR "closingCashSatang" >= 0)
);

CREATE TABLE "PaymentMethodSetting" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isCash" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentMethodSetting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BillLine_billId_idx" ON "BillLine"("billId");
CREATE INDEX "BillLine_orderItemId_idx" ON "BillLine"("orderItemId");
CREATE INDEX "BillDiscount_billId_createdAt_idx" ON "BillDiscount"("billId", "createdAt");
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");
CREATE INDEX "Refund_branchId_createdAt_idx" ON "Refund"("branchId", "createdAt");
CREATE INDEX "Refund_billId_status_idx" ON "Refund"("billId", "status");
CREATE INDEX "Refund_paymentId_status_idx" ON "Refund"("paymentId", "status");
CREATE INDEX "CashShift_branchId_status_openedAt_idx" ON "CashShift"("branchId", "status", "openedAt");
CREATE INDEX "CashShift_userId_status_idx" ON "CashShift"("userId", "status");
CREATE UNIQUE INDEX "CashShift_user_open_key" ON "CashShift"("userId") WHERE "status" = 'OPEN';
CREATE UNIQUE INDEX "PaymentMethodSetting_branchId_code_key" ON "PaymentMethodSetting"("branchId", "code");
CREATE INDEX "PaymentMethodSetting_branchId_isActive_sortOrder_idx" ON "PaymentMethodSetting"("branchId", "isActive", "sortOrder");
CREATE INDEX "Payment_cashShiftId_status_idx" ON "Payment"("cashShiftId", "status");
CREATE UNIQUE INDEX "OrderItemIngredient_orderItemId_ingredientId_key" ON "OrderItemIngredient"("orderItemId", "ingredientId");
CREATE INDEX "OrderItemIngredient_ingredientId_idx" ON "OrderItemIngredient"("ingredientId");

ALTER TABLE "BillLine" ADD CONSTRAINT "BillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillLine" ADD CONSTRAINT "BillLine_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillDiscount" ADD CONSTRAINT "BillDiscount_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillDiscount" ADD CONSTRAINT "BillDiscount_billLineId_fkey" FOREIGN KEY ("billLineId") REFERENCES "BillLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "CashShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentMethodSetting" ADD CONSTRAINT "PaymentMethodSetting_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItemIngredient" ADD CONSTRAINT "OrderItemIngredient_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItemIngredient" ADD CONSTRAINT "OrderItemIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "BillLine" ("id", "billId", "orderItemId", "quantity", "nameSnapshot", "unitPriceSatang", "subtotalSatang")
SELECT 'legacy_' || md5(bill."id" || ':' || item."id"), bill."id", item."id", item."quantity", item."nameSnapshot", item."priceSatang", item."priceSatang" * item."quantity"
FROM "Bill" bill
JOIN "Order" ordering ON ordering."tableSessionId" = bill."tableSessionId" AND ordering."status" <> 'CANCELLED'
JOIN "OrderItem" item ON item."orderId" = ordering."id" AND item."status" <> 'CANCELLED';

INSERT INTO "PaymentMethodSetting" ("id", "branchId", "code", "name", "isCash", "sortOrder", "updatedAt")
SELECT 'pm_' || md5(branch."id" || ':' || method.code), branch."id", method.code, method.name, method.is_cash, method.sort_order, CURRENT_TIMESTAMP
FROM "Branch" branch
CROSS JOIN (VALUES
  ('CASH', 'เงินสด', true, 10),
  ('CARD', 'บัตร', false, 20),
  ('QR_PAYMENT', 'QR Payment', false, 30),
  ('BANK_TRANSFER', 'โอนเงิน', false, 40),
  ('OTHER', 'อื่น ๆ', false, 50)
) AS method(code, name, is_cash, sort_order);

INSERT INTO "OrderItemIngredient" ("id", "orderItemId", "ingredientId", "quantity", "unitCostSatang")
SELECT
  'usage_' || md5(item."id" || ':' || recipe."ingredientId"),
  item."id",
  recipe."ingredientId",
  recipe."quantity" * item."quantity",
  balance."averageCostSatang"
FROM "OrderItem" item
JOIN "RecipeItem" recipe ON recipe."menuItemId" = item."menuItemId"
JOIN "Order" ordering ON ordering."id" = item."orderId"
LEFT JOIN "InventoryBalance" balance ON balance."branchId" = ordering."branchId" AND balance."ingredientId" = recipe."ingredientId"
ON CONFLICT ("orderItemId", "ingredientId") DO NOTHING;

CREATE FUNCTION enforce_bill_line_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Bill" bill
    JOIN "OrderItem" item ON item."id" = NEW."orderItemId"
    JOIN "Order" ordering ON ordering."id" = item."orderId"
    WHERE bill."id" = NEW."billId" AND bill."tableSessionId" = ordering."tableSessionId"
  ) THEN
    RAISE EXCEPTION 'Bill line session does not match order item session';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION enforce_bill_discount_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."billLineId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "BillLine" line WHERE line."id" = NEW."billLineId" AND line."billId" = NEW."billId"
  ) THEN
    RAISE EXCEPTION 'Discount line does not belong to bill';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION enforce_refund_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Bill" bill
    JOIN "Payment" payment ON payment."id" = NEW."paymentId" AND payment."billId" = bill."id"
    WHERE bill."id" = NEW."billId" AND bill."branchId" = NEW."branchId"
  ) THEN
    RAISE EXCEPTION 'Refund bill, payment and branch do not match';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION enforce_payment_shift_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."cashShiftId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "CashShift" shift
    JOIN "Bill" bill ON bill."id" = NEW."billId"
    WHERE shift."id" = NEW."cashShiftId" AND shift."branchId" = bill."branchId"
  ) THEN
    RAISE EXCEPTION 'Payment shift does not match bill branch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "BillLine_integrity" BEFORE INSERT OR UPDATE OF "billId", "orderItemId" ON "BillLine" FOR EACH ROW EXECUTE FUNCTION enforce_bill_line_integrity();
CREATE TRIGGER "BillDiscount_integrity" BEFORE INSERT OR UPDATE OF "billId", "billLineId" ON "BillDiscount" FOR EACH ROW EXECUTE FUNCTION enforce_bill_discount_integrity();
CREATE TRIGGER "Refund_integrity" BEFORE INSERT OR UPDATE OF "branchId", "billId", "paymentId" ON "Refund" FOR EACH ROW EXECUTE FUNCTION enforce_refund_integrity();
CREATE TRIGGER "Payment_shift_integrity" BEFORE INSERT OR UPDATE OF "billId", "cashShiftId" ON "Payment" FOR EACH ROW EXECUTE FUNCTION enforce_payment_shift_integrity();
