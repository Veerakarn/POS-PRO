-- AlterTable
ALTER TABLE "User"
ADD COLUMN "mustChangePin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "failedPinAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "pinLockedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Role"
ADD COLUMN "description" TEXT,
ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Split the former broad order permission into the three screens employees use.
UPDATE "Role" AS role
SET "permissions" = (
  SELECT jsonb_agg(permission ORDER BY permission)
  FROM (
    SELECT DISTINCT value AS permission
    FROM jsonb_array_elements_text(
      (role."permissions" - 'order.manage') ||
      '["pos.use", "kitchen.view", "service.manage"]'::jsonb
    )
  ) AS permissions
)
WHERE role."permissions" ? 'order.manage';

-- The built-in owner role always keeps every available permission.
UPDATE "Role"
SET
  "description" = COALESCE("description", 'เจ้าของร้าน สิทธิ์ครบทุกส่วนและทุกสาขา'),
  "isSystem" = true,
  "isActive" = true,
  "permissions" = '["organization.manage", "branch.manage", "menu.manage", "user.manage", "table.manage", "pos.use", "kitchen.view", "service.manage", "payment.manage", "inventory.manage", "printer.manage", "report.view"]'::jsonb
WHERE "name" = 'Owner';

-- PostgreSQL treats NULL values as distinct in a regular unique index. Remove any
-- historical duplicate global assignments before enforcing the intended rule.
WITH ranked_global_assignments AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId", "roleId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS row_number
  FROM "RoleAssignment"
  WHERE "branchId" IS NULL
)
DELETE FROM "RoleAssignment"
WHERE "id" IN (
  SELECT "id"
  FROM ranked_global_assignments
  WHERE row_number > 1
);

CREATE UNIQUE INDEX "RoleAssignment_global_userId_roleId_key"
ON "RoleAssignment"("userId", "roleId")
WHERE "branchId" IS NULL;

-- Keep tenant boundaries valid even if a future code path writes assignments
-- without going through the current Server Actions.
CREATE FUNCTION check_role_assignment_organization()
RETURNS trigger AS $$
DECLARE
  user_organization_id TEXT;
  role_organization_id TEXT;
  branch_organization_id TEXT;
BEGIN
  SELECT "organizationId" INTO user_organization_id FROM "User" WHERE "id" = NEW."userId";
  SELECT "organizationId" INTO role_organization_id FROM "Role" WHERE "id" = NEW."roleId";

  IF user_organization_id IS DISTINCT FROM role_organization_id THEN
    RAISE EXCEPTION 'Role assignment user and role must belong to the same organization'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."branchId" IS NOT NULL THEN
    SELECT "organizationId" INTO branch_organization_id FROM "Branch" WHERE "id" = NEW."branchId";
    IF user_organization_id IS DISTINCT FROM branch_organization_id THEN
      RAISE EXCEPTION 'Role assignment branch must belong to the user organization'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RoleAssignment_organization_guard"
BEFORE INSERT OR UPDATE OF "userId", "roleId", "branchId" ON "RoleAssignment"
FOR EACH ROW EXECUTE FUNCTION check_role_assignment_organization();
