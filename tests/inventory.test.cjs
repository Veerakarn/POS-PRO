const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Prisma } = require("@prisma/client");
const { parseQuantity, parseReceiptCost, receivedAverageCost, recipeCost } = require("../src/lib/inventory-math.ts");
const { inventoryScope, canManageInventoryBranch } = require("../src/lib/inventory-access.ts");
const D = (value) => new Prisma.Decimal(value);

test("quantities reject negative, exponent, excess precision and oversized input", () => {
  for (const value of ["-1", "1e4", "0", "1.0001", "NaN", "1000000000", ""]) assert.throws(() => parseQuantity(value));
  assert.equal(parseQuantity("0", true).toString(), "0");
  assert.equal(parseQuantity("1.125").toString(), "1.125");
});
test("money and average cost retain fractional satang until display", () => {
  assert.equal(parseReceiptCost("0.29"), 29);
  assert.equal(parseReceiptCost("180.50"), 18050);
  assert.throws(() => parseReceiptCost("1.111"));
  assert.equal(receivedAverageCost(D(1000), D(18), D(500), 12000).toString(), "20");
  assert.equal(receivedAverageCost(D(0), null, D(3), 100).toString(), "33.333333");
});
test("negative or unvalued stock does not create a negative weighted cost", () => {
  assert.equal(receivedAverageCost(D(-200), D(20), D(1000), 18000).toString(), "18");
  assert.equal(receivedAverageCost(D(100), null, D(1000), 18000).toString(), "18");
});
test("missing recipe or missing price is incomplete, but free ingredients are known", () => {
  assert.equal(recipeCost([]).complete, false);
  assert.equal(recipeCost([{ quantity: D(1), cost: null }]).complete, false);
  const cost = recipeCost([{ quantity: D(150), cost: D(20) }, { quantity: D(1), cost: D(0) }]);
  assert.equal(cost.complete, true);
  assert.equal(cost.knownSatang.toString(), "3000");
});
test("inventory permission is bound to the assignment that grants it", () => {
  const manager = { roleAssignments: [
    { branchId: "a", role: { permissions: ["inventory.manage"] } },
    { branchId: null, role: { permissions: ["report.view"] } },
  ] };
  assert.equal(inventoryScope(manager).canManageShared, false);
  assert.equal(canManageInventoryBranch(manager, "a"), true);
  assert.equal(canManageInventoryBranch(manager, "b"), false);
  assert.equal(canManageInventoryBranch({ roleAssignments: [{ branchId: null, role: { permissions: ["inventory.manage"] } }] }, "b"), true);
});
