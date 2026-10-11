require("@next/env").loadEnvConfig(process.cwd());
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, createHash } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const { enqueueOrderTickets, enqueueReceipt } = require("../src/lib/print-service.ts");

const db = new PrismaClient();
after(async () => db.$disconnect());

test("routes order and receipt documents exactly once", async () => {
  const rollback = new Error("ROLLBACK_PRINT_FIXTURES");
  await assert.rejects(db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: "Print rollback test",
        slug: `print-test-${randomUUID()}`,
        branches: { create: [{ name: "A", code: "A" }, { name: "B", code: "B" }] },
        categories: { create: { name: "Food" } },
      },
      include: { branches: true, categories: true },
    });
    const [branch] = org.branches;
    const station = await tx.productionStation.create({ data: { branchId: branch.id, name: "Kitchen", kind: "KITCHEN" } });
    const menu = await tx.menuItem.create({ data: { organizationId: org.id, categoryId: org.categories[0].id, name: "Rice", priceSatang: 5000, stationRoutes: { create: { stationId: station.id } } } });
    const agent = await tx.printAgent.create({ data: { branchId: branch.id, name: "Agent", tokenHash: createHash("sha256").update(randomUUID()).digest("hex") } });
    const printer = await tx.printer.create({ data: { branchId: branch.id, printAgentId: agent.id, name: "Kitchen printer", connection: "NETWORK", endpoint: "127.0.0.1:9100" } });
    await tx.printRoutingRule.createMany({ data: [
      { branchId: branch.id, printerId: printer.id, stationId: station.id, documentType: "ORDER_TICKET" },
      { branchId: branch.id, printerId: printer.id, documentType: "RECEIPT" },
    ] });
    const table = await tx.restaurantTable.create({ data: { branchId: branch.id, code: "T1", name: "Table 1", qrSecret: randomUUID() } });
    const session = await tx.tableSession.create({ data: { branchId: branch.id, tableId: table.id, accessNonce: randomUUID() } });
    const order = await tx.order.create({ data: { branchId: branch.id, tableSessionId: session.id, orderNumber: 1, status: "SUBMITTED", idempotencyKey: randomUUID(), items: { create: { menuItemId: menu.id, nameSnapshot: menu.name, priceSatang: menu.priceSatang, quantity: 2 } } } });

    assert.equal(await enqueueOrderTickets(tx, { branchId: branch.id, orderId: order.id }), 1);
    assert.equal(await enqueueOrderTickets(tx, { branchId: branch.id, orderId: order.id }), 0);
    const orderJob = await tx.printJob.findFirst({ where: { branchId: branch.id, documentType: "ORDER_TICKET" } });
    assert.equal(orderJob.status, "QUEUED");
    assert.equal(orderJob.document.lines[0].name, "Rice");

    const bill = await tx.bill.create({ data: { branchId: branch.id, tableSessionId: session.id, billNumber: 1, status: "PAID", subtotalSatang: 10000, totalSatang: 10000, payments: { create: { method: "CASH", status: "SUCCEEDED", amountSatang: 10000, idempotencyKey: randomUUID() } } } });
    assert.equal(await enqueueReceipt(tx, { branchId: branch.id, billId: bill.id }), 1);
    assert.equal(await enqueueReceipt(tx, { branchId: branch.id, billId: bill.id }), 0);
    assert.equal(await tx.printJob.count({ where: { branchId: branch.id } }), 2);

    throw rollback;
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 90_000 }), (error) => error === rollback);
});

test("database rejects print jobs that cross branches", async () => {
  const org = await db.organization.create({ data: { name: "Print tenant test", slug: `print-tenant-${randomUUID()}`, branches: { create: [{ name: "A", code: "A" }, { name: "B", code: "B" }] } }, include: { branches: true } });
  const [branch, otherBranch] = org.branches;
  try {
    const printer = await db.printer.create({ data: { branchId: branch.id, name: "Tenant printer", connection: "NETWORK", endpoint: "127.0.0.1:9100" } });
    await assert.rejects(db.printJob.create({ data: { branchId: otherBranch.id, printerId: printer.id, documentType: "TEST", idempotencyKey: randomUUID(), document: { version: 1, type: "TEST" } } }), /branch does not match printer branch/);
  } finally {
    await db.organization.delete({ where: { id: org.id } });
  }
});
