ALTER TABLE "PrintRoutingRule" DROP CONSTRAINT "PrintRoutingRule_valid_type_check";
ALTER TABLE "PrintRoutingRule" ADD CONSTRAINT "PrintRoutingRule_valid_type_check" CHECK (
  ("documentType" = 'ORDER_TICKET' AND "stationId" IS NOT NULL)
  OR ("documentType" IN ('RECEIPT', 'TABLE_QR') AND "stationId" IS NULL)
);
