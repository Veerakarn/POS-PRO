import type { Prisma } from "@prisma/client";

export type OrderTicketDocument = {
  version: 1;
  type: "ORDER_TICKET";
  title: string;
  branchName: string;
  stationName: string;
  orderNumber: number;
  tableName: string;
  source: string;
  createdAt: string;
  copies: number;
  lines: Array<{ quantity: number; name: string; note?: string }>;
};

export type ReceiptDocument = {
  version: 1;
  type: "RECEIPT";
  title: string;
  branchName: string;
  billNumber: number;
  tableName: string;
  createdAt: string;
  copies: number;
  lines: Array<{ quantity: number; name: string; unitPriceSatang: number; totalSatang: number }>;
  subtotalSatang: number;
  discountSatang: number;
  taxSatang: number;
  totalSatang: number;
  paymentMethods: string[];
  footer: string[];
};

export type TableQrDocument = {
  version: 1;
  type: "TABLE_QR";
  title: string;
  branchName: string;
  tableName: string;
  url: string;
  createdAt: string;
  copies: number;
};

type TransactionClient = Prisma.TransactionClient;

export async function enqueueOrderTickets(tx: TransactionClient, input: { branchId: string; orderId: string }) {
  const order = await tx.order.findFirst({
    where: { id: input.orderId, branchId: input.branchId },
    select: {
      id: true,
      orderNumber: true,
      source: true,
      createdAt: true,
      branch: { select: { name: true } },
      tableSession: { select: { table: { select: { name: true } } } },
      items: {
        where: { status: { not: "CANCELLED" } },
        select: {
          nameSnapshot: true,
          quantity: true,
          note: true,
          menuItem: {
            select: {
              stationRoutes: {
                where: { station: { branchId: input.branchId, isActive: true } },
                select: {
                  station: {
                    select: {
                      id: true,
                      name: true,
                      printRoutes: {
                        where: { documentType: "ORDER_TICKET", isActive: true, printer: { isActive: true } },
                        select: { printerId: true, copies: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!order) return 0;

  const grouped = new Map<string, { printerId: string; stationId: string; stationName: string; copies: number; lines: OrderTicketDocument["lines"] }>();
  for (const item of order.items) {
    for (const stationRoute of item.menuItem.stationRoutes) {
      for (const printRoute of stationRoute.station.printRoutes) {
        const key = `${printRoute.printerId}:${stationRoute.station.id}`;
        const group = grouped.get(key) ?? {
          printerId: printRoute.printerId,
          stationId: stationRoute.station.id,
          stationName: stationRoute.station.name,
          copies: printRoute.copies,
          lines: [],
        };
        group.lines.push({
          quantity: item.quantity,
          name: item.nameSnapshot,
          ...(item.note ? { note: item.note } : {}),
        });
        grouped.set(key, group);
      }
    }
  }

  if (!grouped.size) return 0;
  const result = await tx.printJob.createMany({
    data: [...grouped.values()].map((group) => ({
      branchId: input.branchId,
      printerId: group.printerId,
      documentType: "ORDER_TICKET" as const,
      idempotencyKey: `order:${order.id}:printer:${group.printerId}:station:${group.stationId}`,
      document: {
        version: 1,
        type: "ORDER_TICKET",
        title: "ใบสั่งอาหาร",
        branchName: order.branch.name,
        stationName: group.stationName,
        orderNumber: order.orderNumber,
        tableName: order.tableSession.table.name,
        source: order.source,
        createdAt: order.createdAt.toISOString(),
        copies: group.copies,
        lines: group.lines,
      } satisfies OrderTicketDocument,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

export async function enqueueReceipt(tx: TransactionClient, input: { branchId: string; billId: string }) {
  const [bill, routes] = await Promise.all([
    tx.bill.findFirst({
      where: { id: input.billId, branchId: input.branchId },
      select: {
        id: true,
        billNumber: true,
        subtotalSatang: true,
        discountSatang: true,
        taxSatang: true,
        totalSatang: true,
        updatedAt: true,
        branch: { select: { name: true } },
        payments: { where: { status: "SUCCEEDED" }, orderBy: { createdAt: "asc" }, select: { method: true } },
        lines: { orderBy: { createdAt: "asc" }, select: { nameSnapshot: true, quantity: true, unitPriceSatang: true, subtotalSatang: true } },
        tableSession: {
          select: {
            table: { select: { name: true } },
            orders: {
              where: { status: { not: "CANCELLED" } },
              orderBy: { orderNumber: "asc" },
              select: {
                items: {
                  where: { status: { not: "CANCELLED" } },
                  orderBy: { createdAt: "asc" },
                  select: { nameSnapshot: true, quantity: true, priceSatang: true },
                },
              },
            },
          },
        },
      },
    }),
    tx.printRoutingRule.findMany({
      where: {
        branchId: input.branchId,
        documentType: "RECEIPT",
        stationId: null,
        isActive: true,
        printer: { isActive: true },
      },
      select: { printerId: true, copies: true },
    }),
  ]);
  if (!bill || !routes.length) return 0;

  const lines = bill.lines.length
    ? bill.lines.map((item) => ({ quantity: item.quantity, name: item.nameSnapshot, unitPriceSatang: item.unitPriceSatang, totalSatang: item.subtotalSatang }))
    : bill.tableSession.orders.flatMap((order) => order.items).map((item) => ({
      quantity: item.quantity,
      name: item.nameSnapshot,
      unitPriceSatang: item.priceSatang,
      totalSatang: item.priceSatang * item.quantity,
    }));
  const result = await tx.printJob.createMany({
    data: routes.map((route) => ({
      branchId: input.branchId,
      printerId: route.printerId,
      documentType: "RECEIPT" as const,
      idempotencyKey: `receipt:${bill.id}:printer:${route.printerId}`,
      document: {
        version: 1,
        type: "RECEIPT",
        title: "ใบเสร็จรับเงิน",
        branchName: bill.branch.name,
        billNumber: bill.billNumber,
        tableName: bill.tableSession.table.name,
        createdAt: bill.updatedAt.toISOString(),
        copies: route.copies,
        lines,
        subtotalSatang: bill.subtotalSatang,
        discountSatang: bill.discountSatang,
        taxSatang: bill.taxSatang,
        totalSatang: bill.totalSatang,
        paymentMethods: bill.payments.map((payment) => payment.method),
        footer: ["ขอบคุณที่ใช้บริการ"],
      } satisfies ReceiptDocument,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

export async function enqueueTableSessionQr(tx: TransactionClient, input: {
  branchId: string;
  sessionId: string;
  tableName: string;
  branchName: string;
  url: string;
  createdAt: Date;
}) {
  const routes = await tx.printRoutingRule.findMany({
    where: {
      branchId: input.branchId,
      documentType: "TABLE_QR",
      stationId: null,
      isActive: true,
      printer: { isActive: true },
    },
    select: { printerId: true, copies: true },
  });
  if (!routes.length) return 0;

  const result = await tx.printJob.createMany({
    data: routes.map((route) => ({
      branchId: input.branchId,
      printerId: route.printerId,
      documentType: "TABLE_QR" as const,
      idempotencyKey: `table-qr:${input.sessionId}:printer:${route.printerId}`,
      document: {
        version: 1,
        type: "TABLE_QR",
        title: "QR สั่งอาหารประจำโต๊ะ",
        branchName: input.branchName,
        tableName: input.tableName,
        url: input.url,
        createdAt: input.createdAt.toISOString(),
        copies: route.copies,
      } satisfies TableQrDocument,
    })),
    skipDuplicates: true,
  });
  return result.count;
}
