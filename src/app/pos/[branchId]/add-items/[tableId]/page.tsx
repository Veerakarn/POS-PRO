import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { CounterAddItemsClient, type CounterAddMenuItem } from "@/components/counter-add-items-client";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function CounterAddItemsPage({
  params,
}: {
  params: Promise<{ branchId: string; tableId: string }>;
}) {
  await connection();
  const { branchId, tableId } = await params;
  const user = await requirePermission("pos.use", branchId);
  const [table, menuItems] = await Promise.all([
    db.restaurantTable.findFirst({
      where: {
        id: tableId,
        branchId,
        isActive: true,
        branch: { organizationId: user.organizationId },
        sessions: { some: { status: "OPEN" } },
      },
      select: {
        name: true,
        branch: { select: { name: true, organization: { select: { name: true } } } },
      },
    }),
    db.menuItem.findMany({
      where: { organizationId: user.organizationId, isActive: true, category: { isActive: true } },
      orderBy: [{ category: { sortOrder: "asc" } }, { createdAt: "asc" }],
      select: { id: true, name: true, description: true, priceSatang: true, imageUrl: true, category: { select: { name: true } } },
    }),
  ]);

  if (!table) redirect(`/pos/${branchId}`);

  const items: CounterAddMenuItem[] = menuItems.map((item) => ({ ...item, category: item.category.name }));
  return (
    <AppShell branchName={table.branch.name} organizationName={table.branch.organization.name} userName={user.displayName}>
      <CounterAddItemsClient
        branchId={branchId}
        branchName={table.branch.name}
        menuItems={items}
        restaurantName={table.branch.organization.name}
        tableId={tableId}
        tableName={table.name}
      />
    </AppShell>
  );
}
