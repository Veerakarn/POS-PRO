import { redirect } from "next/navigation";
import { connection } from "next/server";

import { BranchForm } from "@/components/branch-form";
import { AppShell } from "@/components/app-shell";
import { requireOrganizationPermission } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function BranchesPage() {
  await connection();
  const user = await requireOrganizationPermission("branch.manage");
  const organization = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: {
      name: true,
      branches: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          code: true,
          timezone: true,
          currency: true,
          createdAt: true,
          _count: {
            select: {
              tables: true,
              stations: true,
              printers: true,
            },
          },
        },
      },
    },
  });

  if (!organization) redirect("/setup");
  const primaryBranch = organization.branches[0];

  return (
    <AppShell branchName={primaryBranch?.name} organizationName={organization.name} userName={user.displayName}>
      <main className="branch-page">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Back Office · Organization</p>
            <h1>จัดการสาขา</h1>
            <p className="page-description">สร้างสาขาได้ไม่จำกัด แล้วค่อยกำหนดโต๊ะ เมนู จุดผลิต และเครื่องพิมพ์ของแต่ละสาขา</p>
          </div>
        </header>
        <section className="branch-layout">
          <article className="branch-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">สาขาในระบบ</p><h2>{organization.branches.length} สาขา</h2></div>
            </div>
            <div className="branch-list">
              {organization.branches.map((branch) => (
                <article className="branch-item" key={branch.id}>
                  <div>
                    <strong>{branch.name}</strong>
                    <p>{branch.code} · {branch.timezone} · {branch.currency}</p>
                  </div>
                  <div className="branch-counts" aria-label={`สถานะ ${branch.name}`}>
                    <span>{branch._count.tables} โต๊ะ</span>
                    <span>{branch._count.stations} จุดผลิต</span>
                    <span>{branch._count.printers} เครื่องพิมพ์</span>
                  </div>
                </article>
              ))}
            </div>
          </article>
          <aside className="branch-create-card">
            <p className="eyebrow">เพิ่มสาขา</p>
            <h2>เริ่มสาขาถัดไป</h2>
            <p>ข้อมูลสาขาจะถูกแยกจากสาขาอื่น แต่ยังรวมในรายงานขององค์กรเดียวกัน</p>
            <BranchForm />
          </aside>
        </section>
      </main>
    </AppShell>
  );
}
