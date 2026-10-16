import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { MenuStationRouteForm, StationForm } from "@/components/station-forms";
import { requireOrganizationPermission } from "@/lib/auth";
import { db } from "@/lib/db";

function stationKindLabel(kind: string) {
  if (kind === "KITCHEN") return "ครัว";
  if (kind === "BAR") return "บาร์เครื่องดื่ม";
  if (kind === "SERVICE") return "จุดบริการ";
  return "อื่น ๆ";
}

export default async function StationsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  await connection();
  const [user, { branch: requestedBranchId }] = await Promise.all([requireOrganizationPermission("menu.manage"), searchParams]);
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
          stations: {
            where: { isActive: true },
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              kind: true,
              menuRoutes: {
                orderBy: { menuItem: { name: "asc" } },
                select: { id: true, menuItem: { select: { name: true } } },
              },
            },
          },
        },
      },
      menuItems: {
        where: { isActive: true, category: { isActive: true } },
        orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
        select: { id: true, name: true, category: { select: { name: true } } },
      },
    },
  });
  if (!organization) redirect("/setup");
  const selectedBranch = organization.branches.find((branch) => branch.id === requestedBranchId) ?? organization.branches[0];
  if (!selectedBranch) redirect("/settings/branches");

  return (
    <AppShell branchName={selectedBranch.name} organizationName={organization.name} userName={user.displayName}>
      <main className="branch-page stations-page">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Operations setup · จุดผลิต</p>
            <h1>ครัว บาร์ และเส้นทางเมนู</h1>
            <p className="page-description">เพิ่มจุดผลิตได้ตามจริงของแต่ละสาขา แล้วกำหนดว่าเมนูใดต้องส่งไปจุดใด</p>
          </div>
          <Link className="primary-button compact" href={`/kitchen/${selectedBranch.id}`}>เปิดหน้าจอครัว</Link>
        </header>

        {organization.branches.length > 1 ? <nav className="branch-switcher" aria-label="เลือกสาขา">{organization.branches.map((branch) => <Link className={branch.id === selectedBranch.id ? "filter-button active" : "filter-button"} href={`/settings/stations?branch=${encodeURIComponent(branch.id)}`} key={branch.id}>{branch.name}</Link>)}</nav> : null}

        <section className="branch-layout station-settings-layout">
          <article className="branch-panel">
            <div className="panel-heading"><div><p className="eyebrow">จุดผลิตของ {selectedBranch.name}</p><h2>{selectedBranch.stations.length} จุด</h2></div></div>
            {selectedBranch.stations.length ? <div className="station-list">
              {selectedBranch.stations.map((station) => (
                <article className="station-card" key={station.id}>
                  <div><span>{stationKindLabel(station.kind)}</span><h3>{station.name}</h3></div>
                  <p>{station.menuRoutes.length ? station.menuRoutes.map((route) => route.menuItem.name).join(" · ") : "ยังไม่มีเมนูส่งมาที่จุดนี้"}</p>
                </article>
              ))}
            </div> : <p className="empty-state">ยังไม่มีจุดผลิต เพิ่มครัวหรือบาร์แรกของสาขาได้จากฟอร์มด้านขวา</p>}
          </article>
          <aside className="branch-create-card">
            <p className="eyebrow">เพิ่มจุดผลิต</p>
            <h2>ครัวหรือบาร์ใหม่</h2>
            <p>จุดผลิตหนึ่งจุดสามารถรับหลายเมนู และเมนูหนึ่งรายการกำหนดได้มากกว่าหนึ่งจุด</p>
            <StationForm branches={organization.branches} selectedBranchId={selectedBranch.id} />
          </aside>
        </section>

        <section className="station-routing-panel">
          <div className="panel-heading"><div><p className="eyebrow">Menu routing</p><h2>กำหนดเมนูไปยังจุดผลิต</h2></div></div>
          <MenuStationRouteForm
            menuItems={organization.menuItems.map((item) => ({ id: item.id, name: item.name, category: item.category.name }))}
            stations={selectedBranch.stations}
          />
        </section>
      </main>
    </AppShell>
  );
}
