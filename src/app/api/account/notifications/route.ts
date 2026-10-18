import { getCurrentUser, getPermissionScope } from "@/lib/auth";
import { userHasPermission } from "@/lib/authorization";
import { db } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.mustChangePin || !userHasPermission(user.roleAssignments, "service.manage")) {
    return Response.json({ count: 0, items: [] }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const scope = getPermissionScope(user, "service.manage");
  const where = {
    branch: { organizationId: user.organizationId },
    ...(!scope.allBranches ? { branchId: { in: scope.branchIds } } : {}),
    status: "OPEN" as const,
  };
  const [count, requests] = await Promise.all([
    db.serviceRequest.count({ where }),
    db.serviceRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 20,
      select: { id: true, type: true, createdAt: true, table: { select: { name: true } }, branch: { select: { name: true } } },
    }),
  ]);
  return Response.json({ count, items: requests.map((request) => ({
    id: request.id, title: `${request.table.name} · ${request.type === "CHECK_BILL" ? "ขอเช็กบิล" : "เรียกพนักงาน"}`,
    detail: request.branch.name, createdAt: request.createdAt.toISOString(),
  })) }, { headers: { "Cache-Control": "private, no-store" } });
}
