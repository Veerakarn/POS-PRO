require("@next/env").loadEnvConfig(process.cwd());
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { PrismaClient, Prisma } = require("@prisma/client");
const { consumeOrderIngredients, restoreCancelledOrderItemIngredients } = require("../src/lib/inventory-service.ts");
const { closeCashShiftLedger } = require("../src/lib/cash-shift-service.ts");
const { applyBillDiscount, createBillFromSelections, refundPayment, settleBillPayment, voidOpenBill } = require("../src/lib/sales-service.ts");

const db = new PrismaClient();
const D = (value) => new Prisma.Decimal(value);
after(async () => db.$disconnect());

test("sales mutations remain tenant-safe and financially consistent", async () => {
  const rollback = new Error("ROLLBACK_SALES_FIXTURES");
  await assert.rejects(db.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: {
      name: "Sales rollback test", slug: `sales-test-${randomUUID()}`,
      branches: { create: { name: "A", code: "A" } },
      categories: { create: { name: "Food" } },
      ingredients: { create: { name: "Rice", unit: "GRAM" } },
      users: { create: { email: `${randomUUID()}@example.test`, displayName: "Cashier" } },
    }, include: { branches: true, categories: true, ingredients: true, users: true } });
    const branch = org.branches[0];
    const ingredient = org.ingredients[0];
    const user = org.users[0];
    const foreignOrg = await tx.organization.create({ data: { name: "Foreign sales tenant", slug: `foreign-sales-test-${randomUUID()}` } });
    const menu = await tx.menuItem.create({ data: { organizationId: org.id, categoryId: org.categories[0].id, name: "Rice bowl", priceSatang: 1000, recipeItems: { create: { ingredientId: ingredient.id, quantity: D(2) } } } });
    await tx.inventoryBalance.create({ data: { branchId: branch.id, ingredientId: ingredient.id, quantity: D(100), averageCostSatang: D(25) } });
    await tx.paymentMethodSetting.createMany({ data: [
      { branchId: branch.id, code: "CASH", name: "Cash", isCash: true },
      { branchId: branch.id, code: "CARD", name: "Card", isCash: false },
    ] });
    const shift = await tx.cashShift.create({ data: { branchId: branch.id, userId: user.id, openingCashSatang: 5000 } });
    const table = await tx.restaurantTable.create({ data: { branchId: branch.id, code: "T1", name: "Table 1", qrSecret: randomUUID() } });
    const session = await tx.tableSession.create({ data: { branchId: branch.id, tableId: table.id, accessNonce: randomUUID() } });
    const order = await tx.order.create({ data: { branchId: branch.id, tableSessionId: session.id, orderNumber: 1, status: "SUBMITTED", idempotencyKey: randomUUID(), items: { create: [
      { menuItemId: menu.id, nameSnapshot: menu.name, priceSatang: menu.priceSatang, quantity: 3 },
      { menuItemId: menu.id, nameSnapshot: `${menu.name} cancel`, priceSatang: menu.priceSatang, quantity: 1 },
    ] } }, include: { items: true } });
    await consumeOrderIngredients(tx, { orderId: order.id, orderNumber: 1, branchId: branch.id, organizationId: org.id, items: new Map([[menu.id, 4]]) });
    let balance = await tx.inventoryBalance.findUnique({ where: { branchId_ingredientId: { branchId: branch.id, ingredientId: ingredient.id } } });
    assert.equal(balance.quantity.toString(), "92");
    const cancelItem = order.items.find((item) => item.quantity === 1);
    await restoreCancelledOrderItemIngredients(tx, { orderItemId: cancelItem.id, branchId: branch.id, organizationId: org.id, actorName: user.displayName });
    await tx.orderItem.update({ where: { id: cancelItem.id }, data: { status: "CANCELLED", stockRestored: true } });
    balance = await tx.inventoryBalance.findUnique({ where: { id: balance.id } });
    assert.equal(balance.quantity.toString(), "94");
    assert.equal(await tx.stockMovement.count({ where: { orderId: order.id, type: "REVERSAL" } }), 1);

    const saleItem = order.items.find((item) => item.quantity === 3);
    const bill1 = await createBillFromSelections(tx, { branchId: branch.id, tableSessionId: session.id, selections: [{ orderItemId: saleItem.id, quantity: 1 }] });
    await assert.rejects(createBillFromSelections(tx, { branchId: branch.id, tableSessionId: session.id, selections: [{ orderItemId: saleItem.id, quantity: 3 }] }), /เหลือให้แยกบิล 2/);
    await assert.rejects(
      applyBillDiscount(tx, { organizationId: foreignOrg.id, branchId: branch.id, billId: bill1.id, kind: "FIXED", value: 100, reason: "cross-tenant discount", actorId: user.id }),
      /ไม่พบบิลหรือรายการที่ใช้ส่วนลดได้/,
    );
    assert.equal(await tx.billDiscount.count({ where: { billId: bill1.id } }), 0);
    await applyBillDiscount(tx, { organizationId: org.id, branchId: branch.id, billId: bill1.id, kind: "FIXED", value: 100, reason: "test discount", actorId: user.id });
    const firstCashPayment = await settleBillPayment(tx, { branchId: branch.id, billId: bill1.id, methodCode: "CASH", amountSatang: 400, idempotencyKey: randomUUID(), userId: user.id });
    await settleBillPayment(tx, { branchId: branch.id, billId: bill1.id, methodCode: "CASH", amountSatang: 500, idempotencyKey: randomUUID(), userId: user.id });
    assert.equal((await tx.bill.findUnique({ where: { id: bill1.id } })).status, "PAID");

    const billToVoid = await createBillFromSelections(tx, { branchId: branch.id, tableSessionId: session.id, selections: [{ orderItemId: saleItem.id, quantity: 1 }] });
    await assert.rejects(
      voidOpenBill(tx, { organizationId: foreignOrg.id, branchId: branch.id, billId: billToVoid.id, reason: "cross-tenant void" }),
      /ไม่พบบิลที่ยกเลิกได้/,
    );
    assert.equal((await tx.bill.findUnique({ where: { id: billToVoid.id } })).status, "OPEN");
    await voidOpenBill(tx, { organizationId: org.id, branchId: branch.id, billId: billToVoid.id, reason: "test void" });
    const finalBill = await createBillFromSelections(tx, { branchId: branch.id, tableSessionId: session.id, selections: [] });
    assert.equal(finalBill.totalSatang, 2000);
    const paymentKey = randomUUID();
    const settled = await settleBillPayment(tx, { branchId: branch.id, billId: finalBill.id, methodCode: "CARD", amountSatang: 2000, idempotencyKey: paymentKey, userId: user.id });
    assert.equal(settled.closedSession, true);
    assert.equal((await tx.payment.findUnique({ where: { id: settled.paymentId } })).cashShiftId, null);
    assert.equal((await tx.tableSession.findUnique({ where: { id: session.id } })).status, "CLOSED");
    const duplicatePayment = await settleBillPayment(tx, { branchId: branch.id, billId: finalBill.id, methodCode: "CARD", amountSatang: 2000, idempotencyKey: paymentKey, userId: user.id });
    assert.equal(duplicatePayment.duplicate, true);

    const refundKey = randomUUID();
    const refund1 = await refundPayment(tx, { branchId: branch.id, paymentId: settled.paymentId, amountSatang: 500, reason: "partial refund", actorId: user.id, idempotencyKey: refundKey });
    assert.equal(refund1.duplicate, false);
    assert.equal(refund1.cashShiftId, null);
    assert.equal((await refundPayment(tx, { branchId: branch.id, paymentId: settled.paymentId, amountSatang: 500, reason: "partial refund", actorId: user.id, idempotencyKey: refundKey })).duplicate, true);
    await refundPayment(tx, { branchId: branch.id, paymentId: settled.paymentId, amountSatang: 1500, reason: "remaining refund", actorId: user.id, idempotencyKey: randomUUID() });
    assert.equal((await tx.payment.findUnique({ where: { id: settled.paymentId } })).status, "REFUNDED");
    assert.equal((await tx.bill.findUnique({ where: { id: finalBill.id } })).status, "REFUNDED");

    const originalShiftSummary = await closeCashShiftLedger(tx, { branchId: branch.id, shiftId: shift.id, userId: user.id, closingCashSatang: 5900 });
    assert.deepEqual({ cashIn: originalShiftSummary.cashIn, cashOut: originalShiftSummary.cashOut, expectedCashSatang: originalShiftSummary.expectedCashSatang }, { cashIn: 900, cashOut: 0, expectedCashSatang: 5900 });
    await assert.rejects(
      refundPayment(tx, { branchId: branch.id, paymentId: firstCashPayment.paymentId, amountSatang: 100, reason: "cash refund", actorId: user.id, idempotencyKey: randomUUID() }),
      /เปิดกะเงินสดก่อนคืนเงินสด/,
    );

    const refundShift = await tx.cashShift.create({ data: { branchId: branch.id, userId: user.id, openingCashSatang: 10000 } });
    const cashRefund = await refundPayment(tx, { branchId: branch.id, paymentId: firstCashPayment.paymentId, amountSatang: 100, reason: "cash refund", actorId: user.id, idempotencyKey: randomUUID() });
    assert.equal(cashRefund.cashShiftId, refundShift.id);
    const refundShiftSummary = await closeCashShiftLedger(tx, { branchId: branch.id, shiftId: refundShift.id, userId: user.id, closingCashSatang: 9900 });
    assert.deepEqual({ cashIn: refundShiftSummary.cashIn, cashOut: refundShiftSummary.cashOut, expectedCashSatang: refundShiftSummary.expectedCashSatang, differenceSatang: refundShiftSummary.differenceSatang }, { cashIn: 0, cashOut: 100, expectedCashSatang: 9900, differenceSatang: 0 });
    assert.equal((await tx.cashShift.findUnique({ where: { id: shift.id } })).expectedCashSatang, 5900);
    throw rollback;
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 90_000 }), (error) => error === rollback);
});
