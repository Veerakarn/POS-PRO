import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import {
  KitchenDisplayClient,
  type KitchenStationBoard,
  type KitchenTicket,
} from "@/components/kitchen-display-client";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

function formatTicketTime(date: Date) {
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "เมื่อสักครู่";
  if (minutes < 60) return `${minutes} นาที`;
  return `${Math.floor(minutes / 60)} ชม.`;
}

function stationKindLabel(kind: string) {
  if (kind === "KITCHEN") return "ครัว";
  if (kind === "BAR") return "บาร์";
  if (kind === "SERVICE") return "บริการ";
  return "อื่น ๆ";
}

export default async function KitchenPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  await connection();
  const { branchId } = await params;
  const user = await requirePermission("kitchen.view", branchId);
  const branch = await db.branch.findFirst({
    where: { id: branchId, organizationId: user.organizationId },
    select: {
      id: true,
      name: true,
      orderStatusTrackingEnabled: true,
      organization: { select: { name: true } },
      stations: {
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, kind: true },
      },
    },
  });
  if (!branch) redirect("/settings/branches");

  const orderItems = await db.orderItem.findMany({
    where: {
      status: { notIn: branch.orderStatusTrackingEnabled ? ["CANCELLED", "SERVED"] : ["CANCELLED"] },
      order: {
        branchId: branch.id,
        status: { not: "CANCELLED" },
        tableSession: {
          status: { in: ["OPEN", "CHECK_REQUESTED", "PAYMENT_IN_PROGRESS"] },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      orderId: true,
      status: true,
      nameSnapshot: true,
      quantity: true,
      note: true,
      createdAt: true,
      order: {
        select: {
          orderNumber: true,
          createdAt: true,
          tableSession: { select: { table: { select: { name: true, code: true } } } },
        },
      },
      menuItem: {
        select: {
          stationRoutes: {
            where: { station: { branchId: branch.id, isActive: true } },
            select: { stationId: true },
          },
        },
      },
    },
  });

  const ticketByStation = new Map(branch.stations.map((station) => [station.id, [] as KitchenTicket[]]));
  const unroutedTickets: KitchenTicket[] = [];
  for (const item of orderItems) {
    const ticket: KitchenTicket = {
      id: item.id,
      orderId: item.orderId,
      status: item.status,
      name: item.nameSnapshot,
      quantity: item.quantity,
      note: item.note,
      tableName: item.order.tableSession.table.name,
      tableCode: item.order.tableSession.table.code,
      orderNumber: item.order.orderNumber,
      createdAtLabel: formatTicketTime(item.order.createdAt),
    };
    if (!item.menuItem.stationRoutes.length) {
      unroutedTickets.push(ticket);
      continue;
    }
    for (const route of item.menuItem.stationRoutes) ticketByStation.get(route.stationId)?.push(ticket);
  }

  const stations: KitchenStationBoard[] = branch.stations.map((station) => ({
    id: station.id,
    name: station.name,
    kind: stationKindLabel(station.kind),
    tickets: ticketByStation.get(station.id) ?? [],
  }));

  return (
    <AppShell branchName={branch.name} organizationName={branch.organization.name} userName={user.displayName}>
      <KitchenDisplayClient branchId={branch.id} trackingEnabled={branch.orderStatusTrackingEnabled} branchName={branch.name} stations={stations} unroutedTickets={unroutedTickets} />
    </AppShell>
  );
}
