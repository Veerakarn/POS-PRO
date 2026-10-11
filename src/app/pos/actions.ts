"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { consumeOrderIngredients, restoreCancelledOrderItemIngredients } from "@/lib/inventory-service";
import { enqueueOrderTickets } from "@/lib/print-service";
import { applyBillDiscount, createBillFromSelections, SalesError, settleBillPayment, voidOpenBill } from "@/lib/sales-service";

export type CounterActionResult = {
  error?: string;
  success?: string;
};

export type CounterOrderInput = {
  branchId: string;
  tableId: string;
  idempotencyKey: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
  }>;
};

export type CounterPaymentMethod = string;

type CounterTableInput = {
  branchId: string;
  tableId: string;
};

function isSafeIdentifier(value: string, maxLength = 100) {
  return value.length > 0 && value.length <= maxLength;
}

function refreshCounterPages(branchId: string) {
  revalidatePath(`/pos/${branchId}`);
  revalidatePath("/pos");
  revalidatePath("/dashboard");
  revalidatePath("/requests");
  revalidatePath("/sales");
  revalidatePath("/shifts");
}

async function findCounterTable(input: CounterTableInput, organizationId: string) {
  return db.restaurantTable.findFirst({
    where: {
      id: input.tableId,
      branchId: input.branchId,
      isActive: true,
      branch: { organizationId },
    },
    select: {
      id: true,
      branchId: true,
    },
  });
}

export async function openCounterTable(input: CounterTableInput): Promise<CounterActionResult> {
  if (!isSafeIdentifier(input.branchId) || !isSafeIdentifier(input.tableId)) {
    return { error: "ไม่พบโต๊ะที่เลือก" };
  }

  const user = await requirePermission("pos.use", input.branchId);
  const table = await findCounterTable(input, user.organizationId);
  if (!table) return { error: "ไม่พบโต๊ะที่เลือก" };

  try {
    const result = await db.$transaction(
      async (tx) => {
        const activeSession = await tx.tableSession.findFirst({
          where: {
            tableId: table.id,
            status: { in: ["OPEN", "CHECK_REQUESTED", "PAYMENT_IN_PROGRESS"] },
          },
          select: { id: true },
        });
        if (activeSession) return { error: "โต๊ะนี้เปิดใช้งานอยู่แล้ว" };

        const session = await tx.tableSession.create({
          data: {
            branchId: table.branchId,
            tableId: table.id,
            accessNonce: randomBytes(24).toString("base64url"),
          },
          select: { id: true },
        });
        await tx.auditLog.create({
          data: {
            organizationId: user.organizationId,
            branchId: table.branchId,
            actorId: user.id,
            action: "table.opened_from_counter",
            entityType: "TableSession",
            entityId: session.id,
            after: { tableId: table.id },
          },
        });
        return { success: "เปิดโต๊ะแล้ว" };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
    if (result.success) refreshCounterPages(input.branchId);
    return result;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === "P2002") return { error: "โต๊ะนี้เปิดใช้งานอยู่แล้ว" };
    return { error: "เปิดโต๊ะไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}

export async function submitCounterOrder(input: CounterOrderInput): Promise<CounterActionResult> {
  if (
    !isSafeIdentifier(input.branchId) ||
    !isSafeIdentifier(input.tableId) ||
    !isSafeIdentifier(input.idempotencyKey) ||
    input.items.length === 0 ||
    input.items.length > 30
  ) {
    return { error: "ข้อมูลรายการอาหารไม่ถูกต้อง" };
  }

  const requestedItems = new Map<string, number>();
  for (const item of input.items) {
    if (!isSafeIdentifier(item.menuItemId, 60) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
      return { error: "จำนวนรายการอาหารไม่ถูกต้อง" };
    }
    requestedItems.set(item.menuItemId, (requestedItems.get(item.menuItemId) ?? 0) + item.quantity);
  }

  const user = await requirePermission("pos.use", input.branchId);
  try {
    const result = await db.$transaction(
      async (tx) => {
        const table = await tx.restaurantTable.findFirst({
          where: {
            id: input.tableId,
            branchId: input.branchId,
            isActive: true,
            branch: { organizationId: user.organizationId },
          },
          select: { id: true, branchId: true },
        });
        if (!table) return { error: "ไม่พบโต๊ะที่เลือก" };

        const session = await tx.tableSession.findFirst({
          where: {
            tableId: table.id,
            status: "OPEN",
          },
          orderBy: { openedAt: "desc" },
          select: { id: true },
        });
        if (!session) return { error: "กรุณาเปิดโต๊ะก่อนเพิ่มรายการอาหาร" };

        const existingOrder = await tx.order.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: { orderNumber: true },
        });
        if (existingOrder) return { success: `ส่งออเดอร์ #${existingOrder.orderNumber} แล้ว` };

        const menuItems = await tx.menuItem.findMany({
          where: {
            organizationId: user.organizationId,
            id: { in: [...requestedItems.keys()] },
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            priceSatang: true,
          },
        });
        if (menuItems.length !== requestedItems.size) {
          return { error: "มีเมนูบางรายการถูกปิดหรือไม่มีอยู่แล้ว กรุณาเลือกใหม่" };
        }

        const latestOrder = await tx.order.aggregate({
          where: { branchId: table.branchId },
          _max: { orderNumber: true },
        });
        const order = await tx.order.create({
          data: {
            branchId: table.branchId,
            tableSessionId: session.id,
            orderNumber: (latestOrder._max.orderNumber ?? 0) + 1,
            status: "SUBMITTED",
            source: "COUNTER",
            idempotencyKey: input.idempotencyKey,
            items: {
              create: menuItems.map((menuItem) => ({
                menuItemId: menuItem.id,
                nameSnapshot: menuItem.name,
                priceSatang: menuItem.priceSatang,
                quantity: requestedItems.get(menuItem.id)!,
              })),
            },
          },
          select: { id: true, orderNumber: true },
        });
        await consumeOrderIngredients(tx, {
          orderId: order.id, orderNumber: order.orderNumber,
          branchId: table.branchId, organizationId: user.organizationId, items: requestedItems,
        });
        await enqueueOrderTickets(tx, { branchId: table.branchId, orderId: order.id });
        await tx.auditLog.create({
          data: {
            organizationId: user.organizationId,
            branchId: table.branchId,
            actorId: user.id,
            action: "order.submitted_from_counter",
            entityType: "Order",
            entityId: order.id,
            after: {
              orderNumber: order.orderNumber,
              tableId: table.id,
              itemCount: [...requestedItems.values()].reduce((total, quantity) => total + quantity, 0),
            },
          },
        });
        return { success: `ส่งออเดอร์ #${order.orderNumber} แล้ว` };
      },
      { maxWait: 10_000, timeout: 30_000, isolationLevel: "Serializable" },
    );
    if (result.success) refreshCounterPages(input.branchId);
    return result;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === "P2002" || code === "P2034") {
      return { error: "มีรายการถูกส่งพร้อมกัน กรุณาส่งออเดอร์อีกครั้ง" };
    }
    return { error: "ส่งออเดอร์ไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}

export async function requestCounterBill(input: CounterTableInput): Promise<CounterActionResult> {
  if (!isSafeIdentifier(input.branchId) || !isSafeIdentifier(input.tableId)) {
    return { error: "ไม่พบโต๊ะที่เลือก" };
  }

  const user = await requirePermission("pos.use", input.branchId);
  try {
    const result = await db.$transaction(
      async (tx) => {
        const table = await tx.restaurantTable.findFirst({
          where: {
            id: input.tableId,
            branchId: input.branchId,
            branch: { organizationId: user.organizationId },
          },
          select: { id: true, branchId: true },
        });
        if (!table) return { error: "ไม่พบโต๊ะที่เลือก" };

        const session = await tx.tableSession.findFirst({
          where: { tableId: table.id, status: { in: ["OPEN", "CHECK_REQUESTED", "PAYMENT_IN_PROGRESS"] } },
          orderBy: { openedAt: "desc" },
          select: { id: true, status: true },
        });
        if (!session) return { error: "โต๊ะนี้ยังไม่ได้เปิดใช้งาน" };

        const existingBill = await tx.bill.findFirst({
          where: { tableSessionId: session.id, status: { in: ["OPEN", "PARTIALLY_PAID"] } },
          orderBy: { createdAt: "desc" },
          select: { id: true, billNumber: true },
        });
        const orderItems = await tx.orderItem.findMany({
          where: { order: { tableSessionId: session.id }, status: { not: "CANCELLED" } },
          select: {
            quantity: true,
            billLines: {
              where: { bill: { status: { not: "VOIDED" } } },
              select: { quantity: true },
            },
          },
        });
        const hasUnbilledItems = orderItems.some((item) => item.billLines.reduce((sum, line) => sum + line.quantity, 0) < item.quantity);
        const bill = hasUnbilledItems
          ? await createBillFromSelections(tx, { branchId: table.branchId, tableSessionId: session.id, selections: [] })
          : existingBill;
        if (!bill) return { error: "ไม่มีรายการที่ออกบิลได้" };
        await tx.tableSession.update({ where: { id: session.id }, data: { status: "CHECK_REQUESTED" } });
        await tx.auditLog.create({ data: { organizationId: user.organizationId, branchId: table.branchId, actorId: user.id, action: "table.check_bill_requested_from_counter", entityType: "Bill", entityId: bill.id, after: { tableId: table.id, billNumber: bill.billNumber } } });
        return { success: `สร้างบิล #${bill.billNumber} และส่งเข้าสู่ขั้นตอนชำระเงินแล้ว` };
      },
      { maxWait: 10_000, timeout: 30_000, isolationLevel: "Serializable" },
    );
    if (result.success) refreshCounterPages(input.branchId);
    return result;
  } catch (error) {
    if (error instanceof SalesError) return { error: error.message };
    return { error: "ขอเช็กบิลไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}

export async function receiveCounterPayment(
  input: { branchId: string; billId: string; method: CounterPaymentMethod; amountSatang: number; idempotencyKey: string },
): Promise<CounterActionResult> {
  if (
    !isSafeIdentifier(input.branchId) ||
    !isSafeIdentifier(input.billId) ||
    !isSafeIdentifier(input.idempotencyKey) ||
    !isSafeIdentifier(input.method, 40) ||
    !Number.isInteger(input.amountSatang) || input.amountSatang < 1
  ) {
    return { error: "ข้อมูลการชำระเงินไม่ถูกต้อง" };
  }

  const user = await requirePermission("payment.manage", input.branchId);
  try {
    const result = await db.$transaction(
      async (tx) => {
        const bill = await tx.bill.findFirst({ where: { id: input.billId, branchId: input.branchId, branch: { organizationId: user.organizationId } }, select: { id: true, billNumber: true } });
        if (!bill) return { error: "ไม่พบบิลที่เลือก" };
        const payment = await settleBillPayment(tx, { branchId: input.branchId, billId: bill.id, methodCode: input.method, amountSatang: input.amountSatang, idempotencyKey: input.idempotencyKey, userId: user.id });
        if (!payment.duplicate) {
          await tx.auditLog.create({
            data: {
              organizationId: user.organizationId,
              branchId: input.branchId,
              actorId: user.id,
              action: "payment.received_at_counter",
              entityType: "Payment",
              entityId: payment.paymentId,
              after: { billId: bill.id, billNumber: bill.billNumber, method: input.method, amountSatang: input.amountSatang, closedSession: payment.closedSession },
            },
          });
        }
        return { success: payment.closedSession ? `รับชำระบิล #${bill.billNumber} ครบและปิดโต๊ะแล้ว` : `บันทึกยอดชำระบิล #${bill.billNumber} แล้ว` };
      },
      { maxWait: 10_000, timeout: 15_000, isolationLevel: "Serializable" },
    );
    if (result.success) refreshCounterPages(input.branchId);
    return result;
  } catch (error) {
    if (error instanceof SalesError) return { error: error.message };
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === "P2002" || code === "P2034") {
      return { error: "มีการชำระเงินพร้อมกัน กรุณาตรวจสอบบิลอีกครั้ง" };
    }
    return { error: "บันทึกการชำระเงินไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}

export async function createSplitCounterBill(input: { branchId: string; tableId: string; selections: Array<{ orderItemId: string; quantity: number }> }): Promise<CounterActionResult> {
  if (!isSafeIdentifier(input.branchId) || !isSafeIdentifier(input.tableId) || !input.selections.length || input.selections.length > 100) return { error: "เลือกรายการสำหรับแยกบิล" };
  const user = await requirePermission("payment.manage", input.branchId);
  try {
    const result = await db.$transaction(async (tx) => {
      const session = await tx.tableSession.findFirst({ where: { tableId: input.tableId, branchId: input.branchId, status: { in: ["OPEN", "CHECK_REQUESTED", "PAYMENT_IN_PROGRESS"] }, branch: { organizationId: user.organizationId } }, orderBy: { openedAt: "desc" }, select: { id: true } });
      if (!session) return { error: "ไม่พบโต๊ะที่เปิดอยู่" };
      const bill = await createBillFromSelections(tx, { branchId: input.branchId, tableSessionId: session.id, selections: input.selections });
      await tx.tableSession.update({ where: { id: session.id }, data: { status: "PAYMENT_IN_PROGRESS" } });
      await tx.auditLog.create({ data: { organizationId: user.organizationId, branchId: input.branchId, actorId: user.id, action: "bill.split_created", entityType: "Bill", entityId: bill.id, after: { billNumber: bill.billNumber, selections: input.selections } } });
      return { success: `สร้างบิลแยก #${bill.billNumber} แล้ว` };
    }, { maxWait: 10_000, timeout: 30_000, isolationLevel: "Serializable" });
    if (result.success) refreshCounterPages(input.branchId);
    return result;
  } catch (error) {
    if (error instanceof SalesError) return { error: error.message };
    return { error: "สร้างบิลแยกไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}

export async function applyCounterDiscount(input: { branchId: string; billId: string; billLineId?: string; kind: "FIXED" | "PERCENT"; value: number; reason: string }): Promise<CounterActionResult> {
  if (!isSafeIdentifier(input.branchId) || !isSafeIdentifier(input.billId) || (input.billLineId && !isSafeIdentifier(input.billLineId)) || !["FIXED", "PERCENT"].includes(input.kind) || !Number.isInteger(input.value) || input.value < 1 || input.reason.trim().length < 3 || input.reason.length > 200) return { error: "ข้อมูลส่วนลดไม่ถูกต้อง" };
  if (input.kind === "PERCENT" && input.value > 10_000) return { error: "ส่วนลดเปอร์เซ็นต์ต้องไม่เกิน 100%" };
  const user = await requirePermission("payment.manage", input.branchId);
  try {
    await db.$transaction(async (tx) => {
      const discount = await applyBillDiscount(tx, {
        ...input,
        organizationId: user.organizationId,
        billLineId: input.billLineId || null,
        reason: input.reason.trim(),
        actorId: user.id,
      });
      await tx.auditLog.create({ data: { organizationId: user.organizationId, branchId: input.branchId, actorId: user.id, action: "bill.discount_applied", entityType: "Bill", entityId: input.billId, reason: input.reason.trim(), after: { discountId: discount.id, billLineId: input.billLineId || null, kind: input.kind, value: input.value, amountSatang: discount.amountSatang } } });
    }, { maxWait: 10_000, timeout: 20_000, isolationLevel: "Serializable" });
    refreshCounterPages(input.branchId);
    return { success: "ใช้ส่วนลดกับบิลแล้ว" };
  } catch (error) {
    return { error: error instanceof SalesError ? error.message : "บันทึกส่วนลดไม่สำเร็จ" };
  }
}

export async function cancelCounterOrderItem(input: { branchId: string; tableId: string; orderItemId: string; reason: string }): Promise<CounterActionResult> {
  if (!isSafeIdentifier(input.branchId) || !isSafeIdentifier(input.tableId) || !isSafeIdentifier(input.orderItemId) || input.reason.trim().length < 3 || input.reason.length > 200) return { error: "ระบุเหตุผลการยกเลิกอย่างน้อย 3 ตัวอักษร" };
  const user = await requirePermission("payment.manage", input.branchId);
  try {
    const result = await db.$transaction(async (tx) => {
      const item = await tx.orderItem.findFirst({ where: { id: input.orderItemId, order: { branchId: input.branchId, tableSession: { tableId: input.tableId }, branch: { organizationId: user.organizationId } } }, select: { id: true, nameSnapshot: true, status: true, orderId: true, billLines: { where: { bill: { status: { not: "VOIDED" } } }, select: { id: true } } } });
      if (!item || item.status === "CANCELLED") return { error: "ไม่พบรายการที่ยกเลิกได้" };
      if (item.billLines.length) return { error: "รายการนี้อยู่ในบิลแล้ว กรุณายกเลิกบิลก่อน" };
      await restoreCancelledOrderItemIngredients(tx, { orderItemId: item.id, branchId: input.branchId, organizationId: user.organizationId, actorName: user.displayName });
      await tx.orderItem.update({ where: { id: item.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: user.id, cancellationReason: input.reason.trim(), stockRestored: true } });
      const activeItems = await tx.orderItem.count({ where: { orderId: item.orderId, status: { not: "CANCELLED" } } });
      if (!activeItems) await tx.order.update({ where: { id: item.orderId }, data: { status: "CANCELLED" } });
      await tx.auditLog.create({ data: { organizationId: user.organizationId, branchId: input.branchId, actorId: user.id, action: "order_item.cancelled", entityType: "OrderItem", entityId: item.id, reason: input.reason.trim(), before: { status: item.status }, after: { status: "CANCELLED", stockRestored: true } } });
      return { success: `ยกเลิก ${item.nameSnapshot} และคืนสต็อกแล้ว` };
    }, { maxWait: 10_000, timeout: 30_000, isolationLevel: "Serializable" });
    if (result.success) refreshCounterPages(input.branchId);
    return result;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "ยกเลิกรายการไม่สำเร็จ" };
  }
}

export async function voidCounterBill(input: { branchId: string; billId: string; reason: string }): Promise<CounterActionResult> {
  if (!isSafeIdentifier(input.branchId) || !isSafeIdentifier(input.billId) || input.reason.trim().length < 3 || input.reason.length > 200) return { error: "ระบุเหตุผลการยกเลิกบิล" };
  const user = await requirePermission("payment.manage", input.branchId);
  try {
    await db.$transaction(async (tx) => {
      await voidOpenBill(tx, {
        organizationId: user.organizationId,
        branchId: input.branchId,
        billId: input.billId,
        reason: input.reason.trim(),
      });
      await tx.auditLog.create({ data: { organizationId: user.organizationId, branchId: input.branchId, actorId: user.id, action: "bill.voided", entityType: "Bill", entityId: input.billId, reason: input.reason.trim() } });
    });
    refreshCounterPages(input.branchId);
    return { success: "ยกเลิกบิลแล้ว รายการพร้อมนำไปสร้างบิลใหม่" };
  } catch (error) {
    return { error: error instanceof SalesError ? error.message : "ยกเลิกบิลไม่สำเร็จ" };
  }
}

export async function moveCounterTable(input: { branchId: string; tableId: string; targetTableId: string }): Promise<CounterActionResult> {
  if (!isSafeIdentifier(input.branchId) || !isSafeIdentifier(input.tableId) || !isSafeIdentifier(input.targetTableId) || input.tableId === input.targetTableId) return { error: "เลือกโต๊ะปลายทางให้ถูกต้อง" };
  const user = await requirePermission("pos.use", input.branchId);
  try {
    const result = await db.$transaction(async (tx) => {
      const [source, target] = await Promise.all([
        tx.tableSession.findFirst({ where: { tableId: input.tableId, branchId: input.branchId, status: { in: ["OPEN", "CHECK_REQUESTED", "PAYMENT_IN_PROGRESS"] }, branch: { organizationId: user.organizationId } }, orderBy: { openedAt: "desc" }, select: { id: true, table: { select: { name: true } } } }),
        tx.restaurantTable.findFirst({ where: { id: input.targetTableId, branchId: input.branchId, isActive: true }, select: { id: true, name: true, sessions: { where: { status: { in: ["OPEN", "CHECK_REQUESTED", "PAYMENT_IN_PROGRESS"] } }, select: { id: true }, take: 1 } } }),
      ]);
      if (!source || !target) return { error: "ไม่พบโต๊ะต้นทางหรือปลายทาง" };
      if (target.sessions.length) return { error: "โต๊ะปลายทางมีลูกค้าอยู่แล้ว ให้ใช้รวมโต๊ะแทน" };
      await tx.tableSession.update({ where: { id: source.id }, data: { tableId: target.id } });
      await tx.serviceRequest.updateMany({ where: { tableSessionId: source.id }, data: { tableId: target.id } });
      await tx.auditLog.create({ data: { organizationId: user.organizationId, branchId: input.branchId, actorId: user.id, action: "table.moved", entityType: "TableSession", entityId: source.id, before: { tableId: input.tableId, tableName: source.table.name }, after: { tableId: target.id, tableName: target.name } } });
      return { success: `ย้ายจาก ${source.table.name} ไป ${target.name} แล้ว` };
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 20_000 });
    if (result.success) refreshCounterPages(input.branchId);
    return result;
  } catch { return { error: "ย้ายโต๊ะไม่สำเร็จ กรุณาลองอีกครั้ง" }; }
}

export async function mergeCounterTable(input: { branchId: string; tableId: string; targetTableId: string }): Promise<CounterActionResult> {
  if (!isSafeIdentifier(input.branchId) || !isSafeIdentifier(input.tableId) || !isSafeIdentifier(input.targetTableId) || input.tableId === input.targetTableId) return { error: "เลือกโต๊ะที่จะรวมให้ถูกต้อง" };
  const user = await requirePermission("payment.manage", input.branchId);
  try {
    const result = await db.$transaction(async (tx) => {
      const sessions = await tx.tableSession.findMany({ where: { tableId: { in: [input.tableId, input.targetTableId] }, branchId: input.branchId, status: { in: ["OPEN", "CHECK_REQUESTED", "PAYMENT_IN_PROGRESS"] }, branch: { organizationId: user.organizationId } }, select: { id: true, tableId: true, table: { select: { name: true } } } });
      const source = sessions.find((session) => session.tableId === input.tableId);
      const target = sessions.find((session) => session.tableId === input.targetTableId);
      if (!source || !target) return { error: "ทั้งสองโต๊ะต้องเปิดใช้งานอยู่" };
      await tx.order.updateMany({ where: { tableSessionId: source.id }, data: { tableSessionId: target.id } });
      await tx.bill.updateMany({ where: { tableSessionId: source.id }, data: { tableSessionId: target.id } });
      await tx.serviceRequest.updateMany({ where: { tableSessionId: source.id }, data: { tableSessionId: target.id, tableId: target.tableId } });
      await tx.tableSession.update({ where: { id: source.id }, data: { status: "CLOSED", closedAt: new Date() } });
      await tx.auditLog.create({ data: { organizationId: user.organizationId, branchId: input.branchId, actorId: user.id, action: "table.merged", entityType: "TableSession", entityId: source.id, before: { tableId: source.tableId, tableName: source.table.name }, after: { targetSessionId: target.id, tableId: target.tableId, tableName: target.table.name } } });
      return { success: `รวม ${source.table.name} เข้ากับ ${target.table.name} แล้ว` };
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
    if (result.success) refreshCounterPages(input.branchId);
    return result;
  } catch { return { error: "รวมโต๊ะไม่สำเร็จ กรุณาลองอีกครั้ง" }; }
}
