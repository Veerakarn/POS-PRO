"use server";

import { db } from "@/lib/db";
import { consumeOrderIngredients } from "@/lib/inventory-service";
import { enqueueOrderTickets } from "@/lib/print-service";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestIdentity } from "@/lib/request-identity";

export type QrOrderInput = {
  branchSlug: string;
  branchCode: string;
  tableCode: string;
  qrSecret: string;
  sessionNonce: string;
  idempotencyKey: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
  }>;
};

export type QrOrderResult = {
  error?: string;
  orderNumber?: number;
};

export type QrServiceRequestInput = {
  branchSlug: string;
  branchCode: string;
  tableCode: string;
  qrSecret: string;
  sessionNonce: string;
  type: "STAFF_CALL" | "CHECK_BILL";
};

export type QrServiceRequestResult = {
  error?: string;
  success?: string;
};

function isSafeSegment(value: string, maxLength = 80) {
  return value.length > 0 && value.length <= maxLength;
}

export async function submitQrOrder(input: QrOrderInput): Promise<QrOrderResult> {
  if (
    !isSafeSegment(input.branchSlug) ||
    !isSafeSegment(input.branchCode, 12) ||
    !isSafeSegment(input.tableCode, 12) ||
    !isSafeSegment(input.qrSecret, 128) ||
    !isSafeSegment(input.sessionNonce, 128) ||
    !isSafeSegment(input.idempotencyKey, 100) ||
    input.items.length === 0 ||
    input.items.length > 30
  ) {
    return { error: "ข้อมูลรายการอาหารไม่ถูกต้อง" };
  }

  const requestedItems = new Map<string, number>();
  for (const item of input.items) {
    if (!isSafeSegment(item.menuItemId, 40) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
      return { error: "จำนวนรายการอาหารไม่ถูกต้อง" };
    }
    requestedItems.set(item.menuItemId, (requestedItems.get(item.menuItemId) ?? 0) + item.quantity);
  }

  const rateLimitTable = await db.restaurantTable.findFirst({
    where: {
      code: input.tableCode.toUpperCase(),
      qrSecret: input.qrSecret,
      isActive: true,
      sessions: { some: { accessNonce: input.sessionNonce, status: { in: ["OPEN", "CHECK_REQUESTED", "PAYMENT_IN_PROGRESS"] } } },
      branch: {
        code: input.branchCode.toUpperCase(),
        organization: { slug: input.branchSlug.toLowerCase() },
      },
    },
    select: { id: true },
  });
  if (!rateLimitTable) return { error: "QR นี้ไม่พร้อมใช้งาน" };

  const rateLimit = await consumeRateLimit({
    action: "qr-order",
    resourceIdentity: `${rateLimitTable.id}:${input.sessionNonce}`,
    requestIdentity: await getRequestIdentity(),
    limit: 15,
    windowMs: 5 * 60_000,
    blockMs: 10 * 60_000,
  });
  if (!rateLimit.allowed) return { error: "โต๊ะนี้ส่งรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่" };

  try {
    return await db.$transaction(
      async (tx) => {
        const table = await tx.restaurantTable.findFirst({
          where: {
            code: input.tableCode.toUpperCase(),
            qrSecret: input.qrSecret,
            isActive: true,
            branch: {
              code: input.branchCode.toUpperCase(),
              organization: {
                slug: input.branchSlug.toLowerCase(),
              },
            },
          },
          select: {
            id: true,
            branch: {
              select: {
                id: true,
                organizationId: true,
              },
            },
          },
        });

        if (!table) return { error: "QR นี้ไม่พร้อมใช้งาน" };

        const session = await tx.tableSession.findFirst({
          where: { tableId: table.id, accessNonce: input.sessionNonce, status: { in: ["OPEN", "CHECK_REQUESTED", "PAYMENT_IN_PROGRESS"] } },
          select: { id: true },
        });
        if (!session) return { error: "QR รอบนี้ปิดแล้ว กรุณาขอ QR ใหม่จากพนักงาน" };

        const previousOrder = await tx.order.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: { orderNumber: true },
        });
        if (previousOrder) return { orderNumber: previousOrder.orderNumber };

        const menuItems = await tx.menuItem.findMany({
          where: {
            organizationId: table.branch.organizationId,
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
          where: { branchId: table.branch.id },
          _max: { orderNumber: true },
        });

        const order = await tx.order.create({
          data: {
            branchId: table.branch.id,
            tableSessionId: session.id,
            orderNumber: (latestOrder._max.orderNumber ?? 0) + 1,
            status: "SUBMITTED",
            source: "QR",
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
          select: {
            id: true,
            orderNumber: true,
          },
        });

        await consumeOrderIngredients(tx, {
          orderId: order.id, orderNumber: order.orderNumber,
          branchId: table.branch.id, organizationId: table.branch.organizationId, items: requestedItems,
        });
        await enqueueOrderTickets(tx, { branchId: table.branch.id, orderId: order.id });

        await tx.auditLog.create({
          data: {
            organizationId: table.branch.organizationId,
            branchId: table.branch.id,
            action: "order.submitted_from_qr",
            entityType: "Order",
            entityId: order.id,
            after: {
              orderNumber: order.orderNumber,
              tableId: table.id,
              itemCount: [...requestedItems.values()].reduce((total, quantity) => total + quantity, 0),
            },
          },
        });

        return { orderNumber: order.orderNumber };
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
        isolationLevel: "Serializable",
      },
    );
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === "P2002" || code === "P2034") {
      return { error: "มีรายการถูกส่งพร้อมกัน กรุณากดยืนยันอีกครั้ง" };
    }
    return { error: "ส่งรายการไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}

export async function requestQrService(input: QrServiceRequestInput): Promise<QrServiceRequestResult> {
  if (
    !isSafeSegment(input.branchSlug) ||
    !isSafeSegment(input.branchCode, 12) ||
    !isSafeSegment(input.tableCode, 12) ||
    !isSafeSegment(input.qrSecret, 128) ||
    !isSafeSegment(input.sessionNonce, 128) ||
    !["STAFF_CALL", "CHECK_BILL"].includes(input.type)
  ) {
    return { error: "ข้อมูลคำขอไม่ถูกต้อง" };
  }

  const rateLimitTable = await db.restaurantTable.findFirst({
    where: {
      code: input.tableCode.toUpperCase(),
      qrSecret: input.qrSecret,
      isActive: true,
      sessions: { some: { accessNonce: input.sessionNonce, status: { in: ["OPEN", "CHECK_REQUESTED", "PAYMENT_IN_PROGRESS"] } } },
      branch: {
        code: input.branchCode.toUpperCase(),
        organization: { slug: input.branchSlug.toLowerCase() },
      },
    },
    select: { id: true },
  });
  if (!rateLimitTable) return { error: "QR นี้ไม่พร้อมใช้งาน" };

  const rateLimit = await consumeRateLimit({
    action: "qr-service",
    resourceIdentity: `${rateLimitTable.id}:${input.sessionNonce}`,
    requestIdentity: await getRequestIdentity(),
    limit: 8,
    windowMs: 60_000,
    blockMs: 5 * 60_000,
  });
  if (!rateLimit.allowed) return { error: "ส่งคำขอบ่อยเกินไป กรุณารอสักครู่" };

  try {
    return await db.$transaction(
      async (tx) => {
        const table = await tx.restaurantTable.findFirst({
          where: {
            code: input.tableCode.toUpperCase(),
            qrSecret: input.qrSecret,
            isActive: true,
          sessions: { some: { accessNonce: input.sessionNonce, status: { in: ["OPEN", "CHECK_REQUESTED", "PAYMENT_IN_PROGRESS"] } } },
            branch: {
              code: input.branchCode.toUpperCase(),
              organization: {
                slug: input.branchSlug.toLowerCase(),
              },
            },
          },
          select: {
            id: true,
            branch: {
              select: {
                id: true,
                organizationId: true,
              },
            },
          },
        });
        if (!table) return { error: "QR นี้ไม่พร้อมใช้งาน" };

        const session = await tx.tableSession.findFirst({
          where: {
            tableId: table.id,
            accessNonce: input.sessionNonce,
            status: { in: ["OPEN", "CHECK_REQUESTED", "PAYMENT_IN_PROGRESS"] },
          },
          select: { id: true, status: true },
        });
        if (!session) return { error: "QR รอบนี้ปิดแล้ว กรุณาขอ QR ใหม่จากพนักงาน" };

        if (input.type === "CHECK_BILL") {
          const orderCount = await tx.order.count({
            where: {
              tableSessionId: session.id,
              status: { not: "CANCELLED" },
            },
          });
          if (!orderCount) return { error: "ยังไม่มีรายการอาหารสำหรับเช็กบิล" };
        }

        const existingRequest = await tx.serviceRequest.findFirst({
          where: {
            tableSessionId: session.id,
            type: input.type,
            status: { in: ["OPEN", "ACKNOWLEDGED"] },
          },
          select: { id: true },
        });
        if (existingRequest) {
          return { success: input.type === "STAFF_CALL" ? "พนักงานได้รับคำขอแล้ว" : "ร้านได้รับคำขอเช็กบิลแล้ว" };
        }

        const request = await tx.serviceRequest.create({
          data: {
            branchId: table.branch.id,
            tableId: table.id,
            tableSessionId: session.id,
            type: input.type,
          },
          select: { id: true },
        });

        if (input.type === "CHECK_BILL" && session.status === "OPEN") {
          await tx.tableSession.update({
            where: { id: session.id },
            data: { status: "CHECK_REQUESTED" },
          });
        }

        await tx.auditLog.create({
          data: {
            organizationId: table.branch.organizationId,
            branchId: table.branch.id,
            action: input.type === "STAFF_CALL" ? "service_request.staff_call" : "service_request.check_bill",
            entityType: "ServiceRequest",
            entityId: request.id,
            after: {
              tableId: table.id,
              tableSessionId: session.id,
            },
          },
        });

        return { success: input.type === "STAFF_CALL" ? "ส่งคำขอเรียกพนักงานแล้ว" : "ส่งคำขอเช็กบิลแล้ว" };
      },
      {
        maxWait: 10_000,
        timeout: 15_000,
      },
    );
  } catch {
    return { error: "ส่งคำขอไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}
