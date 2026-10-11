import { Prisma } from "@prisma/client";
import { InventoryError, receivedAverageCost } from "./inventory-math.ts";

export async function recordStockMovement(tx: Prisma.TransactionClient, input: {
  branchId: string; organizationId: string; ingredientId: string;
  type: "RECEIPT" | "WASTE" | "COUNT"; quantity: Prisma.Decimal;
  totalSatang: number | null; reason: string; actorName: string;
  idempotencyKey: string; requestHash: string;
}) {
  const existing = await tx.stockMovement.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.branchId !== input.branchId || existing.requestHash !== input.requestHash) {
      throw new InventoryError("รายการนี้เคยบันทึกด้วยข้อมูลอื่นแล้ว กรุณาโหลดหน้าใหม่");
    }
    return existing;
  }
  const ingredient = await tx.ingredient.findFirst({ where: {
    id: input.ingredientId, organizationId: input.organizationId, isActive: true,
  } });
  const branch = await tx.branch.findFirst({ where: { id: input.branchId, organizationId: input.organizationId } });
  if (!ingredient || !branch) throw new InventoryError("ไม่พบวัตถุดิบหรือสาขาที่เลือก");
  const balance = await tx.inventoryBalance.upsert({
    where: { branchId_ingredientId: { branchId: input.branchId, ingredientId: input.ingredientId } },
    create: { branchId: input.branchId, ingredientId: input.ingredientId }, update: {},
  });
  const delta = input.type === "COUNT" ? input.quantity.minus(balance.quantity)
    : input.type === "WASTE" ? input.quantity.negated() : input.quantity;
  const after = balance.quantity.plus(delta);
  if (input.type === "WASTE" && after.lt(0)) throw new InventoryError("ยอดคงเหลือไม่พอบันทึกของเสีย กรุณาตรวจนับสต็อกก่อน");
  const cost = input.type === "RECEIPT"
    ? receivedAverageCost(balance.quantity, balance.averageCostSatang, input.quantity, input.totalSatang!)
    : balance.averageCostSatang;
  await tx.inventoryBalance.update({ where: { id: balance.id }, data: { quantity: after, averageCostSatang: cost } });
  return tx.stockMovement.create({ data: {
    branchId: input.branchId, ingredientId: input.ingredientId, type: input.type,
    quantity: delta, balanceAfter: after,
    unitCostSatang: input.type === "RECEIPT" ? new Prisma.Decimal(input.totalSatang!).div(input.quantity).toDecimalPlaces(6) : cost,
    receiptCostSatang: input.totalSatang, reason: input.reason, actorName: input.actorName,
    idempotencyKey: input.idempotencyKey, requestHash: input.requestHash,
  } });
}

// Called inside the same serializable transaction that creates the order.
// The caller has already validated the branch, organization and selected menus.
export async function consumeOrderIngredients(
  tx: Prisma.TransactionClient,
  input: { orderId: string; orderNumber: number; branchId: string; organizationId: string; items: Map<string, number> },
) {
  const alreadyConsumed = await tx.stockMovement.count({ where: { orderId: input.orderId, type: "SALE" } });
  if (alreadyConsumed) return;
  const orderItems = await tx.orderItem.findMany({
    where: { orderId: input.orderId, order: { branchId: input.branchId, branch: { organizationId: input.organizationId } } },
    select: {
      id: true,
      quantity: true,
      menuItem: { select: { recipeItems: { select: { ingredientId: true, quantity: true } } } },
    },
  });
  const quantities = new Map<string, Prisma.Decimal>();
  const itemUsages: Array<{ orderItemId: string; ingredientId: string; quantity: Prisma.Decimal }> = [];
  for (const item of orderItems) {
    for (const recipe of item.menuItem.recipeItems) {
      const consumed = recipe.quantity.times(item.quantity);
      itemUsages.push({ orderItemId: item.id, ingredientId: recipe.ingredientId, quantity: consumed });
      quantities.set(recipe.ingredientId, (quantities.get(recipe.ingredientId) ?? new Prisma.Decimal(0)).plus(consumed));
    }
  }
  if (!quantities.size) return;

  await tx.inventoryBalance.createMany({
    data: [...quantities.keys()].map((ingredientId) => ({ branchId: input.branchId, ingredientId })),
    skipDuplicates: true,
  });
  const balances = await tx.inventoryBalance.findMany({
    where: { branchId: input.branchId, ingredientId: { in: [...quantities.keys()] } },
  });
  const balanceByIngredient = new Map(balances.map((balance) => [balance.ingredientId, balance]));
  await tx.orderItemIngredient.createMany({
    data: itemUsages.map((usage) => ({
      ...usage,
      unitCostSatang: balanceByIngredient.get(usage.ingredientId)?.averageCostSatang ?? null,
    })),
    skipDuplicates: true,
  });
  const updates = balances.map((balance) => ({
    ...balance, after: balance.quantity.minus(quantities.get(balance.ingredientId)!),
  }));
  // A single parameterized update avoids a network round trip per ingredient on Neon.
  await tx.$executeRaw(Prisma.sql`
    UPDATE "InventoryBalance" AS balance
    SET "quantity" = value.quantity, "updatedAt" = NOW()
    FROM (VALUES ${Prisma.join(updates.map((row) => Prisma.sql`(${row.id}, ${row.after.toString()}::numeric)`))}) AS value(id, quantity)
    WHERE balance.id = value.id
  `);
  await tx.stockMovement.createMany({
    data: updates.map((balance) => ({
      branchId: input.branchId,
      ingredientId: balance.ingredientId,
      orderId: input.orderId,
      type: "SALE",
      quantity: quantities.get(balance.ingredientId)!.negated(),
      balanceAfter: balance.after,
      unitCostSatang: balance.averageCostSatang,
      reason: `ออเดอร์ #${input.orderNumber}`,
      idempotencyKey: `sale:${input.orderId}:${balance.ingredientId}`,
    })),
  });
}

export async function restoreCancelledOrderItemIngredients(
  tx: Prisma.TransactionClient,
  input: { orderItemId: string; branchId: string; organizationId: string; actorName: string },
) {
  const item = await tx.orderItem.findFirst({
    where: {
      id: input.orderItemId,
      order: { branchId: input.branchId, branch: { organizationId: input.organizationId } },
    },
    select: {
      id: true,
      orderId: true,
      nameSnapshot: true,
      ingredientUsages: {
        select: { id: true, ingredientId: true, quantity: true, restoredQuantity: true, unitCostSatang: true },
      },
    },
  });
  if (!item) throw new InventoryError("ไม่พบรายการอาหารที่ต้องการคืนสต็อก");
  const pending = item.ingredientUsages.map((usage) => ({
    ...usage,
    restore: usage.quantity.minus(usage.restoredQuantity),
  })).filter((usage) => usage.restore.gt(0));
  if (!pending.length) return 0;

  await tx.inventoryBalance.createMany({
    data: pending.map((usage) => ({ branchId: input.branchId, ingredientId: usage.ingredientId })),
    skipDuplicates: true,
  });
  const balances = await tx.inventoryBalance.findMany({
    where: { branchId: input.branchId, ingredientId: { in: pending.map((usage) => usage.ingredientId) } },
  });
  const updates = balances.map((balance) => {
    const usage = pending.find((candidate) => candidate.ingredientId === balance.ingredientId)!;
    return { balance, usage, after: balance.quantity.plus(usage.restore) };
  });
  await tx.$executeRaw(Prisma.sql`
    UPDATE "InventoryBalance" AS balance
    SET "quantity" = value.quantity, "updatedAt" = NOW()
    FROM (VALUES ${Prisma.join(updates.map((row) => Prisma.sql`(${row.balance.id}, ${row.after.toString()}::numeric)`))}) AS value(id, quantity)
    WHERE balance.id = value.id
  `);
  for (const row of updates) {
    await tx.orderItemIngredient.update({
      where: { id: row.usage.id },
      data: { restoredQuantity: row.usage.quantity },
    });
    await tx.stockMovement.create({
      data: {
        branchId: input.branchId,
        ingredientId: row.usage.ingredientId,
        orderId: item.orderId,
        type: "REVERSAL",
        quantity: row.usage.restore,
        balanceAfter: row.after,
        unitCostSatang: row.usage.unitCostSatang,
        reason: `ยกเลิก ${item.nameSnapshot}`,
        actorName: input.actorName,
        idempotencyKey: `cancel:${item.id}:${row.usage.ingredientId}`,
      },
    });
  }
  return updates.length;
}
