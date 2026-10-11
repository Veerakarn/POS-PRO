import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { StaffManagement } from "@/components/staff-management";
import { requireOrganizationPermission } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function StaffPage() {
  await connection();
  const user = await requireOrganizationPermission("user.manage");
  const organization = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: {
      name: true,
      branches: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, code: true },
      },
      roles: {
        orderBy: [{ isSystem: "desc" }, { isActive: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          description: true,
          permissions: true,
          isSystem: true,
          isActive: true,
          _count: {
            select: {
              roleAssignments: { where: { user: { isActive: true } } },
            },
          },
        },
      },
      users: {
        orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
        select: {
          id: true,
          displayName: true,
          email: true,
          isActive: true,
          mustChangePin: true,
          roleAssignments: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              branchId: true,
              branch: { select: { name: true } },
              role: { select: { id: true, name: true, isSystem: true } },
            },
          },
        },
      },
    },
  });

  if (!organization) redirect("/setup");

  return (
    <AppShell
      branchName={organization.branches[0]?.name}
      organizationName={organization.name}
      userName={user.displayName}
    >
      <main className="branch-page staff-page">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Back Office · Access control</p>
            <h1>พนักงานและสิทธิ์</h1>
            <p className="page-description">
              แยกหน้าจอทำงานตามตำแหน่ง กำหนดได้ทั้งทุกสาขาหรือเฉพาะสาขา และบังคับเปลี่ยน PIN เมื่อเข้าใช้ครั้งแรก
            </p>
          </div>
        </header>
        <StaffManagement
          branches={organization.branches}
          currentUserId={user.id}
          organizationName={organization.name}
          roles={organization.roles.map((role) => ({
            id: role.id,
            name: role.name,
            description: role.description,
            permissions: Array.isArray(role.permissions)
              ? role.permissions.filter((permission): permission is string => typeof permission === "string")
              : [],
            isSystem: role.isSystem,
            isActive: role.isActive,
            assignmentCount: role._count.roleAssignments,
          }))}
          staff={organization.users.map((staff) => ({
            id: staff.id,
            displayName: staff.displayName,
            email: staff.email,
            isActive: staff.isActive,
            mustChangePin: staff.mustChangePin,
            assignments: staff.roleAssignments.map((assignment) => ({
              id: assignment.id,
              roleId: assignment.role.id,
              roleName: assignment.role.name,
              roleIsSystem: assignment.role.isSystem,
              branchId: assignment.branchId,
              branchName: assignment.branch?.name ?? null,
            })),
          }))}
        />
      </main>
    </AppShell>
  );
}
