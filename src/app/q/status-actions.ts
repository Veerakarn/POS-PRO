"use server";

import { db } from "@/lib/db";

export type QrStatusInput = { branchSlug: string; branchCode: string; tableCode: string; qrSecret: string; sessionNonce: string };
export type CustomerOrderProgress = { id: string; orderNumber: number; items: { id: string; name: string; quantity: number; status: string }[] };
export type QrStatusResult = { enabled: boolean; orders: CustomerOrderProgress[]; error?: string };

export async function getQrOrderStatus(input: QrStatusInput): Promise<QrStatusResult> {
  if (![input?.branchSlug, input?.branchCode, input?.tableCode, input?.qrSecret, input?.sessionNonce].every((value) => typeof value === "string" && value.length > 0 && value.length <= 128)) {
    return { enabled: false, orders: [], error: "QR ไม่ถูกต้อง" };
  }
  const session = await db.tableSession.findFirst({
    where: {
      accessNonce: input.sessionNonce,
      status: { in: ["OPEN", "CHECK_REQUESTED", "PAYMENT_IN_PROGRESS"] },
      table: { code: input.tableCode.toUpperCase(), qrSecret: input.qrSecret, isActive: true },
      branch: { code: input.branchCode.toUpperCase(), organization: { slug: input.branchSlug.toLowerCase() } },
    },
    select: {
      branch: { select: { orderStatusTrackingEnabled: true } },
      orders: {
        orderBy: { createdAt: "desc" }, take: 100,
        select: { id: true, orderNumber: true, items: { orderBy: { createdAt: "asc" }, select: { id: true, nameSnapshot: true, quantity: true, status: true } } },
      },
    },
  });
  if (!session) return { enabled: false, orders: [], error: "รอบโต๊ะนี้สิ้นสุดแล้ว กรุณาขอ QR ใหม่จากพนักงาน" };
  if (!session.branch.orderStatusTrackingEnabled) return { enabled: false, orders: [] };
  return { enabled: true, orders: session.orders.map((order) => ({
    id: order.id, orderNumber: order.orderNumber,
    items: order.items.map((item) => ({ id: item.id, name: item.nameSnapshot, quantity: item.quantity, status: item.status })),
  })) };
}
