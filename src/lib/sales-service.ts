import { Prisma, type DiscountKind } from "@prisma/client";

import { enqueueReceipt } from "./print-service.ts";

export class SalesError extends Error {}

type TransactionClient = Prisma.TransactionClient;

export async function recalculateBill(tx: TransactionClient, billId: string) {
  const [lineTotal, discountTotal, bill] = await Promise.all([
    tx.billLine.aggregate({ where: { billId }, _sum: { subtotalSatang: true } }),
    tx.billDiscount.aggregate({ where: { billId }, _sum: { amountSatang: true } }),
    tx.bill.findUnique({ where: { id: billId }, select: { taxSatang: true } }),
  ]);
  if (!bill) throw new SalesError("ไม่พบบิล");
  const subtotalSatang = lineTotal._sum.subtotalSatang ?? 0;
  const discountSatang = Math.min(discountTotal._sum.amountSatang ?? 0, subtotalSatang);
  const totalSatang = Math.max(0, subtotalSatang - discountSatang + bill.taxSatang);
  return tx.bill.update({
    where: { id: billId },
    data: { subtotalSatang, discountSatang, totalSatang },
  });
}

export async function createBillFromSelections(tx: TransactionClient, input: {
  branchId: string;
  tableSessionId: string;
  selections: Array<{ orderItemId: string; quantity: number }>;
}) {
  const session = await tx.tableSession.findFirst({
    where: { id: input.tableSessionId, branchId: input.branchId, status: { in: ["OPEN", "CHECK_REQUESTED", "PAYMENT_IN_PROGRESS"] } },
    select: {
      id: true,
      orders: {
        where: { status: { not: "CANCELLED" } },
        select: { items: { where: { status: { not: "CANCELLED" } }, select: { id: true, nameSnapshot: true, priceSatang: true, quantity: true } } },
      },
    },
  });
  if (!session) throw new SalesError("ไม่พบโต๊ะที่เปิดอยู่");
  const items = session.orders.flatMap((order) => order.items);
  if (!items.length) throw new SalesError("ยังไม่มีรายการอาหารสำหรับสร้างบิล");

  const allocated = await tx.billLine.groupBy({
    by: ["orderItemId"],
    where: { orderItemId: { in: items.map((item) => item.id) }, bill: { status: { not: "VOIDED" } } },
    _sum: { quantity: true },
  });
  const allocatedByItem = new Map(allocated.map((row) => [row.orderItemId, row._sum.quantity ?? 0]));
  const requested = new Map<string, number>();
  for (const selection of input.selections) {
    if (!Number.isInteger(selection.quantity) || selection.quantity < 1) throw new SalesError("จำนวนรายการในบิลไม่ถูกต้อง");
    requested.set(selection.orderItemId, (requested.get(selection.orderItemId) ?? 0) + selection.quantity);
  }
  const selectedItems = items.flatMap((item) => {
    const available = item.quantity - (allocatedByItem.get(item.id) ?? 0);
    const quantity = requested.size ? requested.get(item.id) ?? 0 : available;
    if (quantity > available) throw new SalesError(`${item.nameSnapshot} เหลือให้แยกบิล ${available} รายการ`);
    return quantity > 0 ? [{ ...item, quantity }] : [];
  });
  if (!selectedItems.length) throw new SalesError("เลือกรายการสำหรับสร้างบิลอย่างน้อย 1 รายการ");
  if ([...requested.keys()].some((id) => !items.some((item) => item.id === id))) throw new SalesError("มีรายการที่ไม่ได้อยู่ในโต๊ะนี้");

  const latestBill = await tx.bill.aggregate({ where: { branchId: input.branchId }, _max: { billNumber: true } });
  const subtotalSatang = selectedItems.reduce((sum, item) => sum + item.priceSatang * item.quantity, 0);
  return tx.bill.create({
    data: {
      branchId: input.branchId,
      tableSessionId: session.id,
      billNumber: (latestBill._max.billNumber ?? 0) + 1,
      subtotalSatang,
      totalSatang: subtotalSatang,
      lines: {
        create: selectedItems.map((item) => ({
          orderItemId: item.id,
          quantity: item.quantity,
          nameSnapshot: item.nameSnapshot,
          unitPriceSatang: item.priceSatang,
          subtotalSatang: item.priceSatang * item.quantity,
        })),
      },
    },
    select: { id: true, billNumber: true, subtotalSatang: true, totalSatang: true },
  });
}

export async function applyBillDiscount(tx: TransactionClient, input: {
  organizationId: string;
  branchId: string;
  billId: string;
  billLineId?: string | null;
  kind: DiscountKind;
  value: number;
  reason: string;
  actorId: string;
}) {
  const bill = await tx.bill.findFirst({
    where: {
      id: input.billId,
      branchId: input.branchId,
      status: { in: ["OPEN", "PARTIALLY_PAID"] },
      branch: { organizationId: input.organizationId },
    },
    select: {
      id: true,
      subtotalSatang: true,
      totalSatang: true,
      lines: { where: input.billLineId ? { id: input.billLineId } : undefined, select: { id: true, subtotalSatang: true } },
      discounts: { select: { amountSatang: true, billLineId: true } },
      payments: { where: { status: "SUCCEEDED" }, select: { amountSatang: true } },
    },
  });
  if (!bill || (input.billLineId && bill.lines.length !== 1)) throw new SalesError("ไม่พบบิลหรือรายการที่ใช้ส่วนลดได้");
  const base = input.billLineId ? bill.lines[0].subtotalSatang : bill.subtotalSatang;
  const existingOnScope = bill.discounts.filter((discount) => input.billLineId ? discount.billLineId === input.billLineId : discount.billLineId === null).reduce((sum, discount) => sum + discount.amountSatang, 0);
  const rawAmount = input.kind === "PERCENT" ? Math.round(base * input.value / 10_000) : input.value;
  const amountSatang = Math.min(rawAmount, Math.max(0, base - existingOnScope));
  if (amountSatang <= 0) throw new SalesError("ส่วนลดมากกว่ายอดที่ลดได้");
  const paid = bill.payments.reduce((sum, payment) => sum + payment.amountSatang, 0);
  if (bill.totalSatang - amountSatang < paid) throw new SalesError("ส่วนลดทำให้ยอดสุทธิต่ำกว่ายอดที่รับชำระแล้ว");
  const discount = await tx.billDiscount.create({
    data: { billId: bill.id, billLineId: input.billLineId || null, kind: input.kind, value: input.value, amountSatang, reason: input.reason, actorId: input.actorId },
  });
  await recalculateBill(tx, bill.id);
  return discount;
}

export async function settleBillPayment(tx: TransactionClient, input: {
  branchId: string;
  billId: string;
  methodCode: string;
  amountSatang: number;
  idempotencyKey: string;
  userId: string;
}) {
  const existing = await tx.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, billId: true } });
  if (existing) return { duplicate: true, billId: existing.billId, paymentId: existing.id, closedSession: false };
  const bill = await tx.bill.findFirst({
    where: { id: input.billId, branchId: input.branchId, status: { in: ["OPEN", "PARTIALLY_PAID"] } },
    select: { id: true, totalSatang: true, tableSessionId: true, payments: { where: { status: "SUCCEEDED" }, select: { amountSatang: true } } },
  });
  if (!bill) throw new SalesError("ไม่พบบิลที่รอชำระ");
  const method = await tx.paymentMethodSetting.findFirst({ where: { branchId: input.branchId, code: input.methodCode, isActive: true }, select: { code: true, isCash: true } });
  if (!method) throw new SalesError("วิธีชำระเงินนี้ถูกปิดใช้งานแล้ว");
  const paid = bill.payments.reduce((sum, payment) => sum + payment.amountSatang, 0);
  const remaining = bill.totalSatang - paid;
  if (!Number.isInteger(input.amountSatang) || input.amountSatang < 1 || input.amountSatang > remaining) throw new SalesError(`ยอดรับชำระต้องไม่เกิน ${remaining} สตางค์`);
  const shift = method.isCash
    ? await tx.cashShift.findFirst({ where: { branchId: input.branchId, userId: input.userId, status: "OPEN" }, select: { id: true } })
    : null;
  if (method.isCash && !shift) throw new SalesError("เปิดกะเงินสดก่อนรับชำระด้วยเงินสด");
  const payment = await tx.payment.create({
    data: { billId: bill.id, method: method.code, status: "SUCCEEDED", amountSatang: input.amountSatang, idempotencyKey: input.idempotencyKey, cashShiftId: shift?.id ?? null },
    select: { id: true },
  });
  const isPaid = input.amountSatang === remaining;
  await tx.bill.update({ where: { id: bill.id }, data: { status: isPaid ? "PAID" : "PARTIALLY_PAID" } });

  let closedSession = false;
  if (isPaid) {
    await enqueueReceipt(tx, { branchId: input.branchId, billId: bill.id });
    const [itemTotal, allocationTotal, unsettledBills] = await Promise.all([
      tx.orderItem.aggregate({ where: { order: { tableSessionId: bill.tableSessionId, status: { not: "CANCELLED" } }, status: { not: "CANCELLED" } }, _sum: { quantity: true } }),
      tx.billLine.aggregate({ where: { bill: { tableSessionId: bill.tableSessionId, status: { not: "VOIDED" } } }, _sum: { quantity: true } }),
      tx.bill.count({ where: { tableSessionId: bill.tableSessionId, status: { in: ["OPEN", "PARTIALLY_PAID"] } } }),
    ]);
    if ((itemTotal._sum.quantity ?? 0) === (allocationTotal._sum.quantity ?? 0) && unsettledBills === 0) {
      await tx.tableSession.update({ where: { id: bill.tableSessionId }, data: { status: "CLOSED", closedAt: new Date() } });
      await tx.serviceRequest.updateMany({ where: { tableSessionId: bill.tableSessionId, status: { in: ["OPEN", "ACKNOWLEDGED"] } }, data: { status: "RESOLVED" } });
      closedSession = true;
    } else {
      await tx.tableSession.update({ where: { id: bill.tableSessionId }, data: { status: "PAYMENT_IN_PROGRESS" } });
    }
  } else {
    await tx.tableSession.update({ where: { id: bill.tableSessionId }, data: { status: "PAYMENT_IN_PROGRESS" } });
  }
  return { duplicate: false, billId: bill.id, paymentId: payment.id, closedSession };
}

export async function refundPayment(tx: TransactionClient, input: {
  branchId: string;
  paymentId: string;
  amountSatang: number;
  reason: string;
  actorId: string;
  idempotencyKey: string;
}) {
  const existing = await tx.refund.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { ...existing, duplicate: true };
  const payment = await tx.payment.findFirst({
    where: { id: input.paymentId, bill: { branchId: input.branchId }, status: { in: ["SUCCEEDED", "REFUNDED"] } },
    select: { id: true, billId: true, method: true, amountSatang: true, refunds: { where: { status: "SUCCEEDED" }, select: { amountSatang: true } } },
  });
  if (!payment) throw new SalesError("ไม่พบรายการชำระเงิน");
  const alreadyRefunded = payment.refunds.reduce((sum, refund) => sum + refund.amountSatang, 0);
  const refundable = payment.amountSatang - alreadyRefunded;
  if (!Number.isInteger(input.amountSatang) || input.amountSatang < 1 || input.amountSatang > refundable) throw new SalesError("ยอดคืนเงินมากกว่ายอดที่คืนได้");
  const cashMethod = await tx.paymentMethodSetting.findFirst({
    where: { branchId: input.branchId, code: payment.method, isCash: true },
    select: { id: true },
  });
  const shift = cashMethod
    ? await tx.cashShift.findFirst({ where: { branchId: input.branchId, userId: input.actorId, status: "OPEN" }, select: { id: true } })
    : null;
  if (cashMethod && !shift) throw new SalesError("เปิดกะเงินสดก่อนคืนเงินสด");
  const refund = await tx.refund.create({ data: { branchId: input.branchId, billId: payment.billId, paymentId: payment.id, cashShiftId: shift?.id ?? null, amountSatang: input.amountSatang, reason: input.reason, actorId: input.actorId, idempotencyKey: input.idempotencyKey } });
  if (input.amountSatang === refundable) await tx.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
  const bill = await tx.bill.findUnique({ where: { id: payment.billId }, select: { totalSatang: true, refunds: { where: { status: "SUCCEEDED" }, select: { amountSatang: true } } } });
  const totalRefunded = bill?.refunds.reduce((sum, row) => sum + row.amountSatang, 0) ?? 0;
  if (bill && totalRefunded >= bill.totalSatang) await tx.bill.update({ where: { id: payment.billId }, data: { status: "REFUNDED" } });
  return { ...refund, duplicate: false };
}

export async function voidOpenBill(tx: TransactionClient, input: {
  organizationId: string;
  branchId: string;
  billId: string;
  reason: string;
}) {
  const bill = await tx.bill.findFirst({
    where: {
      id: input.billId,
      branchId: input.branchId,
      status: { in: ["OPEN", "PARTIALLY_PAID"] },
      branch: { organizationId: input.organizationId },
    },
    select: { id: true, payments: { where: { status: "SUCCEEDED" }, select: { id: true } } },
  });
  if (!bill) throw new SalesError("ไม่พบบิลที่ยกเลิกได้");
  if (bill.payments.length) throw new SalesError("บิลที่รับเงินแล้วต้องใช้การคืนเงิน");
  return tx.bill.update({ where: { id: bill.id }, data: { status: "VOIDED", voidedAt: new Date(), voidReason: input.reason } });
}

