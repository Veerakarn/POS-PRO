import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getPermissionScope, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function KitchenEntryPage() {
  await connection();
  const user = await requirePermission("kitchen.view");
  const scope = getPermissionScope(user, "kitchen.view");
  const branch = await db.branch.findFirst({
    where: {
      organizationId: user.organizationId,
      ...(!scope.allBranches ? { id: { in: scope.branchIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!branch) redirect("/account/no-access");
  redirect(`/kitchen/${branch.id}`);
}
