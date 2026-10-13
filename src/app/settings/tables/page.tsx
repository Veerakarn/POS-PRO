import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { TableForm } from "@/components/table-form";
import { AppShell } from "@/components/app-shell";
import { getPermissionScope, requirePermission } from "@/lib/auth";
import { userHasPermission } from "@/lib/authorization";
import { db } from "@/lib/db";

export default async function TablesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  await connection();
  const user = await requirePermission("table.manage");
  const scope = getPermissionScope(user, "table.manage");
  const { branch: requestedBranchId } = await searchParams;
  const organization = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: {
      name: true,
      slug: true,
      branches: {
        where: scope.allBranches ? undefined : { id: { in: scope.branchIds } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          code: true,
          tables: {
            orderBy: { code: "asc" },
            select: {
              id: true,
              name: true,
              code: true,
              capacity: true,
            },
          },
        },
      },
    },
  });

  if (!organization) redirect("/setup");
  const selectedBranch = organization.branches.find((branch) => branch.id === requestedBranchId) ?? organization.branches[0];
  if (!selectedBranch) redirect("/account/no-access");

  return (
    <AppShell branchName={selectedBranch.name} organizationName={organization.name} userName={user.displayName}>
      <main className="branch-page">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Back Office · โต๊ะและ QR</p>
            <h1>โต๊ะของ {selectedBranch.name}</h1>
            <p className="page-description">QR จะสร้างใหม่ทุกครั้งที่พนักงานเปิดโต๊ะ และ QR จากรอบก่อนจะใช้สั่งอาหารไม่ได้</p>
          </div>
          {userHasPermission(user.roleAssignments, "branch.manage") ? (
            <Link className="secondary-button" href="/settings/branches">จัดการสาขา</Link>
          ) : null}
        </header>

        {organization.branches.length > 1 ? (
          <nav className="branch-switcher" aria-label="เลือกสาขา">
            {organization.branches.map((branch) => (
              <Link className={branch.id === selectedBranch.id ? "filter-button active" : "filter-button"} href={`/settings/tables?branch=${encodeURIComponent(branch.id)}`} key={branch.id}>
                {branch.name}
              </Link>
            ))}
          </nav>
        ) : null}

        <section className="branch-layout table-management-layout">
          <article className="branch-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">โต๊ะในสาขา</p><h2>{selectedBranch.tables.length} โต๊ะ</h2></div>
            </div>
            {selectedBranch.tables.length ? <div className="table-list">{selectedBranch.tables.map((table) => <article className="printer-route-card" key={table.id}><div><strong>{table.name}</strong><span>{table.code} · {table.capacity} ที่นั่ง</span></div></article>)}</div> : <p className="empty-state">ยังไม่มีโต๊ะในสาขานี้ เพิ่มโต๊ะจากฟอร์มด้านขวาได้เลย</p>}
            <p className="configuration-notice">เปิดโต๊ะที่หน้า <Link href="/pos">Counter POS</Link> เพื่อสร้าง QR ใหม่และส่งพิมพ์อัตโนมัติ</p>
          </article>
          <aside className="branch-create-card">
            <p className="eyebrow">เพิ่มโต๊ะ</p>
            <h2>สร้างโต๊ะ</h2>
            <p>รหัสโต๊ะจะไม่ซ้ำภายในสาขา ระบบจะสร้าง QR ประจำรอบเมื่อลูกค้าเข้ามาใช้บริการ</p>
            <TableForm
              branches={organization.branches.map(({ id, name, code }) => ({ id, name, code }))}
              selectedBranchId={selectedBranch.id}
            />
          </aside>
        </section>
      </main>
    </AppShell>
  );
}
