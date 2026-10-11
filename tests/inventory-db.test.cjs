// Creates only uniquely named test fixtures; the main scenario rolls back.
require("@next/env").loadEnvConfig(process.cwd());
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { PrismaClient, Prisma } = require("@prisma/client");
const { recordStockMovement, consumeOrderIngredients } = require("../src/lib/inventory-service.ts");
const db = new PrismaClient();
after(async () => db.$disconnect());
const D = (value) => new Prisma.Decimal(value);
const options = { isolationLevel: "Serializable", maxWait: 10000, timeout: 90000 };
const rollbackOptions = { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 90000 };

test("receipts, recipes, orders, duplicate submissions, branch isolation and rollback", async () => {
  const slug = `inventory-test-${randomUUID()}`;
  const rollback = new Error("ROLLBACK_TEST_FIXTURES");
  await assert.rejects(db.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: "Inventory rollback test", slug,
      branches: { create: [{ name: "A", code: "A" }, { name: "B", code: "B" }] },
      ingredients: { create: { name: "Test pork", unit: "GRAM" } },
      categories: { create: { name: "Test" } },
    }, include: { branches: true, ingredients: true, categories: true } });
    const [branch, branchB] = org.branches;
    const ingredientId = org.ingredients[0].id;
    const base = { branchId: branch.id, organizationId: org.id, ingredientId, reason: "automated test", actorName: "test" };
    const receipt = { ...base, type: "RECEIPT", quantity: D(1000), totalSatang: 18000, idempotencyKey: randomUUID(), requestHash: "receipt1" };
    const first = await recordStockMovement(tx, receipt);
    const duplicate = await recordStockMovement(tx, receipt);
    assert.equal(duplicate.id, first.id);
    await assert.rejects(recordStockMovement(tx, { ...receipt, requestHash: "changed" }), /ข้อมูลอื่น/);
    await recordStockMovement(tx, { ...receipt, quantity: D(500), totalSatang: 12000, idempotencyKey: randomUUID(), requestHash: "receipt2" });
    let balance = await tx.inventoryBalance.findUnique({ where: { branchId_ingredientId: { branchId: branch.id, ingredientId } } });
    assert.equal(balance.quantity.toString(), "1500");
    assert.equal(balance.averageCostSatang.toString(), "20");
    await assert.rejects(recordStockMovement(tx, { ...receipt, type: "WASTE", quantity: D(2000), totalSatang: null, idempotencyKey: randomUUID() }), /ไม่พอ/);
    await assert.rejects(recordStockMovement(tx, { ...receipt, organizationId: "other-org", idempotencyKey: randomUUID() }), /ไม่พบ/);
    const menu = await tx.menuItem.create({ data: { organizationId: org.id, categoryId: org.categories[0].id, name: "Test dish", priceSatang: 8000, recipeItems: { create: { ingredientId, quantity: D(150) } } } });
    const table = await tx.restaurantTable.create({ data: { branchId: branch.id, code: "T", name: "Test table", qrSecret: randomUUID() } });
    const session = await tx.tableSession.create({ data: { branchId: branch.id, tableId: table.id, accessNonce: randomUUID() } });
    const order = await tx.order.create({ data: { branchId: branch.id, tableSessionId: session.id, orderNumber: 1, status: "SUBMITTED", idempotencyKey: randomUUID(), items: { create: { menuItemId: menu.id, nameSnapshot: menu.name, priceSatang: menu.priceSatang, quantity: 2 } } } });
    const consumption = { orderId: order.id, orderNumber: 1, branchId: branch.id, organizationId: org.id, items: new Map([[menu.id, 2]]) };
    await consumeOrderIngredients(tx, consumption);
    await consumeOrderIngredients(tx, consumption);
    balance = await tx.inventoryBalance.findUnique({ where: { id: balance.id } });
    assert.equal(balance.quantity.toString(), "1200");
    assert.equal(await tx.stockMovement.count({ where: { orderId: order.id } }), 1);
    assert.equal(await tx.inventoryBalance.count({ where: { branchId: branchB.id } }), 0);
    await tx.recipeItem.updateMany({ where: { menuItemId: menu.id }, data: { quantity: D(200) } });
    const oldMovement = await tx.stockMovement.findFirst({ where: { orderId: order.id } });
    assert.equal(oldMovement.quantity.toString(), "-300");
    assert.equal(oldMovement.unitCostSatang.toString(), "20");
    await recordStockMovement(tx, { ...receipt, type: "COUNT", quantity: D(10), totalSatang: null, idempotencyKey: randomUUID(), requestHash: "count" });
    const order2 = await tx.order.create({ data: { branchId: branch.id, tableSessionId: session.id, orderNumber: 2, status: "SUBMITTED", idempotencyKey: randomUUID(), items: { create: { menuItemId: menu.id, nameSnapshot: menu.name, priceSatang: menu.priceSatang, quantity: 1 } } } });
    await consumeOrderIngredients(tx, { ...consumption, orderId: order2.id, orderNumber: 2, items: new Map([[menu.id, 1]]) });
    balance = await tx.inventoryBalance.findUnique({ where: { id: balance.id } });
    assert.equal(balance.quantity.toString(), "-190");
    throw rollback;
  }, rollbackOptions), (error) => error === rollback);
  assert.equal(await db.organization.count({ where: { slug } }), 0);
});

test("concurrent receipts can be retried without lost stock or double recording", async () => {
  const slug = `inventory-concurrency-${randomUUID()}`;
  const org = await db.organization.create({ data: { name: "Inventory concurrency test", slug,
    branches: { create: { name: "Test", code: "TEST" } }, ingredients: { create: { name: "Test stock", unit: "PIECE" } },
  }, include: { branches: true, ingredients: true } });
  const branchId = org.branches[0].id;
  const ingredientId = org.ingredients[0].id;
  const base = { branchId, ingredientId, organizationId: org.id, type: "RECEIPT", quantity: D(10), totalSatang: 1000, reason: "concurrency test", actorName: "test" };
  const inputs = [1, 2].map((number) => ({ ...base, idempotencyKey: randomUUID(), requestHash: `test-${number}` }));
  const submit = (input) => db.$transaction((tx) => recordStockMovement(tx, input), options);
  try {
    const results = await Promise.allSettled(inputs.map(submit));
    for (let index = 0; index < results.length; index++) {
      if (results[index].status === "rejected") {
        assert.ok(["P2034", "P2002"].includes(results[index].reason.code), "unexpected database failure");
        await submit(inputs[index]);
      }
    }
    await submit(inputs[0]);
    const balance = await db.inventoryBalance.findUnique({ where: { branchId_ingredientId: { branchId, ingredientId } } });
    assert.equal(balance.quantity.toString(), "20");
    assert.equal(await db.stockMovement.count({ where: { branchId } }), 2);
  } finally {
    await db.stockMovement.deleteMany({ where: { branchId } });
    await db.inventoryBalance.deleteMany({ where: { branchId } });
    await db.organization.delete({ where: { id: org.id } });
  }
});
