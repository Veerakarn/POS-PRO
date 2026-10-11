import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import {
  CounterPosLiveClient,
  type CounterTable,
  type CounterTableStatus,
} from "@/components/counter-pos-live-client";
import { requirePermission } from "@/lib/auth";
import { userHasPermission } from "@/lib/authorization";
import { db } from "@/lib/db";

function formatUpdatedAt(date: Date) {
  const differenceMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (differenceMinutes < 1) return "เมื่อสักครู่";
  if (differenceMinutes < 60) return `${differenceMinutes} นาที`;
  const hours = Math.floor(differenceMinutes / 60);
  return `${hours} ชม.`;
}

export default async function CounterPosPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  await connection();
  const { branchId } = await params;
  const user = await requirePermission("pos.use", branchId);
  const canManagePayments = userHasPermission(user.roleAssignments, "payment.manage", branchId);
  const canManageServiceRequests = userHasPermission(user.roleAssignments, "service.manage", branchId);
  const branch = await db.branch.findFirst({
    where: {
      id: branchId,
      organizationId: user.organizationId,
    },
    select: {
      id: true,
      name: true,
      organization: { select: { name: true } },
      tables: {
        where: { isActive: true },
        orderBy: { code: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          capacity: true,
          sessions: {
            where: { status: { in: ["OPEN", "CHECK_REQUESTED", "PAYMENT_IN_PROGRESS"] } },
            orderBy: { openedAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              updatedAt: true,
              orders: {
                where: { status: { not: "CANCELLED" } },
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  updatedAt: true,
                  items: {
                    where: { status: { not: "CANCELLED" } },
                    orderBy: { createdAt: "asc" },
                    select: {
                      id: true,
                      nameSnapshot: true,
                      quantity: true,
                      priceSatang: true,
                      status: true,
                      billLines: {
                        where: { bill: { status: { not: "VOIDED" } } },
                        select: { quantity: true },
                      },
                    },
                  },
                },
              },
              bills: {
                where: { status: { not: "VOIDED" } },
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  billNumber: true,
                  status: true,
                  subtotalSatang: true,
                  discountSatang: true,
                  taxSatang: true,
                  totalSatang: true,
                  lines: { orderBy: { createdAt: "asc" }, select: { id: true, orderItemId: true, quantity: true, nameSnapshot: true, subtotalSatang: true } },
                  discounts: { orderBy: { createdAt: "asc" }, select: { id: true, billLineId: true, amountSatang: true, reason: true } },
                  payments: { where: { status: "SUCCEEDED" }, select: { amountSatang: true } },
                },
              },
            },
          },
        },
      },
      paymentMethods: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { code: true, name: true, isCash: true } },
      cashShifts: { where: { userId: user.id, status: "OPEN" }, take: 1, select: { id: true } },
    },
  });
  if (!branch) redirect("/settings/branches");

  const [menuItems, pendingServiceRequests] = await Promise.all([
    db.menuItem.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        priceSatang: true,
        category: { select: { name: true } },
      },
    }),
    canManageServiceRequests
      ? db.serviceRequest.count({
          where: {
            branchId: branch.id,
            status: { in: ["OPEN", "ACKNOWLEDGED"] },
          },
        })
      : Promise.resolve(0),
  ]);

  const tables: CounterTable[] = branch.tables.map((table) => {
    const session = table.sessions[0];
    const orderLines = session?.orders.flatMap((order) => order.items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      quantity: item.quantity,
      priceSatang: item.priceSatang,
      status: item.status,
      billedQuantity: item.billLines.reduce((sum, line) => sum + line.quantity, 0),
    }))) ?? [];
    const hasPreparingItem = orderLines.some((item) => ["NEW", "ACKNOWLEDGED", "PREPARING"].includes(item.status));
    let status: CounterTableStatus = "ว่าง";
    if (session?.status === "CHECK_REQUESTED" || session?.status === "PAYMENT_IN_PROGRESS") status = "ขอเช็กบิล";
    else if (session && hasPreparingItem) status = "รออาหาร";
    else if (session) status = "กำลังสั่ง";

    const lastOrderUpdate = session?.orders.reduce<Date | null>(
      (latest, order) => !latest || order.updatedAt > latest ? order.updatedAt : latest,
      null,
    );
    const latestUpdate = lastOrderUpdate ?? session?.updatedAt ?? null;

    return {
      id: table.id,
      code: table.code,
      name: table.name,
      capacity: table.capacity,
      status,
      totalSatang: orderLines.reduce((total, item) => total + item.priceSatang * item.quantity, 0),
      updatedAtLabel: latestUpdate ? formatUpdatedAt(latestUpdate) : null,
      hasOpenSession: Boolean(session),
      orderLines,
      bills: session?.bills.map((bill) => ({
        id: bill.id,
        billNumber: bill.billNumber,
        status: bill.status,
        subtotalSatang: bill.subtotalSatang,
        discountSatang: bill.discountSatang,
        taxSatang: bill.taxSatang,
        totalSatang: bill.totalSatang,
        paidSatang: bill.payments.reduce((sum, payment) => sum + payment.amountSatang, 0),
        lines: bill.lines.map((line) => ({ id: line.id, orderItemId: line.orderItemId, quantity: line.quantity, name: line.nameSnapshot, subtotalSatang: line.subtotalSatang })),
        discounts: bill.discounts,
      })) ?? [],
    };
  });

  return (
    <AppShell branchName={branch.name} organizationName={branch.organization.name} userName={user.displayName}>
      <CounterPosLiveClient
        branchId={branch.id}
        branchName={branch.name}
        canManagePayments={canManagePayments}
        canManageServiceRequests={canManageServiceRequests}
        menuItems={menuItems.map((item) => ({ ...item, category: item.category.name }))}
        pendingServiceRequests={pendingServiceRequests}
        paymentMethods={branch.paymentMethods}
        hasOpenCashShift={branch.cashShifts.length > 0}
        tables={tables}
      />
    </AppShell>
  );
}
