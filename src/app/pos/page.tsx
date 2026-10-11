import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getPermissionScope, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function CounterPosEntryPage() {
  await connection();
  const user = await requirePermission("pos.use");
  const scope = getPermissionScope(user, "pos.use");
  const branch = await db.branch.findFirst({
    where: {
      organizationId: user.organizationId,
      ...(!scope.allBranches ? { id: { in: scope.branchIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!branch) redirect("/account/no-access");
  redirect(`/pos/${branch.id}`);
}
