DROP TRIGGER IF EXISTS "PrintJob_tenant_integrity" ON "PrintJob";
DROP TRIGGER IF EXISTS "PrintRoutingRule_tenant_integrity" ON "PrintRoutingRule";
DROP FUNCTION IF EXISTS enforce_print_tenant_integrity();

CREATE FUNCTION enforce_print_job_tenant_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Printer" printer
    WHERE printer."id" = NEW."printerId" AND printer."branchId" = NEW."branchId"
  ) THEN
    RAISE EXCEPTION 'Print entity branch does not match printer branch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION enforce_print_route_tenant_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Printer" printer
    WHERE printer."id" = NEW."printerId" AND printer."branchId" = NEW."branchId"
  ) THEN
    RAISE EXCEPTION 'Print entity branch does not match printer branch';
  END IF;

  IF NEW."stationId" IS NOT NULL AND NOT EXISTS (
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
FOR EACH ROW EXECUTE FUNCTION enforce_print_job_tenant_integrity();

CREATE TRIGGER "PrintRoutingRule_tenant_integrity"
BEFORE INSERT OR UPDATE OF "branchId", "printerId", "stationId" ON "PrintRoutingRule"
FOR EACH ROW EXECUTE FUNCTION enforce_print_route_tenant_integrity();
