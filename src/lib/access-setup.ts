import "server-only";

import { db } from "@/lib/db";

export async function getAccessSetupStatus() {
  const organization = await db.organization.findFirst({ select: { id: true } });
  if (!organization) return "setup";

  const pendingOwner = await db.user.findFirst({
    where: {
      pinHash: null,
      isActive: true,
      roleAssignments: { some: { role: { name: "Owner", isActive: true } } },
    },
    select: { id: true },
  });

  return pendingOwner ? "claim" : "ready";
}
