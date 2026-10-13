import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import QRCode from "qrcode";

import { TableForm } from "@/components/table-form";
import { AppShell } from "@/components/app-shell";
import { getPermissionScope, requirePermission } from "@/lib/auth";
import { userHasPermission } from "@/lib/authorization";
import { db } from "@/lib/db";

function getPublicAppUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configuredUrl) return process.env.NODE_ENV === "production" ? "" : "http://localhost:3000";

  try {
    const url = new URL(configuredUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      (process.env.NODE_ENV === "production" && (
        url.protocol !== "https:" ||
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
    ) return "";

    return url.origin;
  } catch {
    return "";
  }
}

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
              qrSecret: true,
            },
          },
        },
      },
    },
  });

  if (!organization) redirect("/setup");
  const selectedBranch = organization.branches.find((branch) => branch.id === requestedBranchId) ?? organization.branches[0];
  if (!selectedBranch) redirect("/account/no-access");

  const publicAppUrl = getPublicAppUrl();
  const qrTables = await Promise.all(
    selectedBranch.tables.map(async (table) => {
      const qrUrl = publicAppUrl
        ? `${publicAppUrl}/q/${encodeURIComponent(organization.slug)}/${encodeURIComponent(selectedBranch.code)}/${encodeURIComponent(table.code)}?k=${encodeURIComponent(table.qrSecret)}`
        : null;
      return {
        ...table,
        qrUrl,
        qrDataUrl: qrUrl ? await QRCode.toDataURL(qrUrl, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 220,
        }) : null,
      };
    }),
  );

  return (
    <AppShell branchName={selectedBranch.name} organizationName={organization.name} userName={user.displayName}>
      <main className="branch-page">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Back Office · โต๊ะและ QR</p>
            <h1>โต๊ะของ {selectedBranch.name}</h1>
            <p className="page-description">ทุก QR มี secret เฉพาะโต๊ะ และลิงก์ไปยังหน้าสั่งอาหารของสาขาที่เลือก</p>
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

        {!publicAppUrl ? (
          <p className="configuration-notice">ยังไม่สร้าง QR เพราะ URL เว็บไม่ถูกต้องหรือยังไม่ได้ตั้งค่า สำหรับ Vercel ให้ตั้ง <code>NEXT_PUBLIC_APP_URL</code> เป็น URL HTTPS ของเว็บจริง แล้ว deploy ใหม่ ส่วนการใช้งานในเครื่องให้ตั้ง URL ใน <code>.env.local</code> และรีสตาร์ต server</p>
        ) : null}

        <section className="branch-layout table-management-layout">
          <article className="branch-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">QR ที่พร้อมใช้</p><h2>{qrTables.length} โต๊ะ</h2></div>
            </div>
            {qrTables.length ? (
              <div className="qr-grid">
                {qrTables.map((table) => (
                  <article className="qr-card" key={table.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {table.qrDataUrl ? <img alt={`QR สำหรับ ${table.name}`} height={140} src={table.qrDataUrl} width={140} /> : <div className="configuration-notice">ยังไม่มี QR</div>}
                    <div>
                      <strong>{table.name}</strong>
                      <p>{table.code} · {table.capacity} ที่นั่ง</p>
                      {table.qrUrl ? <a href={table.qrUrl} rel="noreferrer" target="_blank">เปิดหน้าสั่งอาหาร</a> : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : <p className="empty-state">ยังไม่มีโต๊ะในสาขานี้ เพิ่มโต๊ะเพื่อสร้าง QR แรกได้จากฟอร์มด้านขวา</p>}
          </article>
          <aside className="branch-create-card">
            <p className="eyebrow">เพิ่มโต๊ะ</p>
            <h2>สร้าง QR ใหม่</h2>
            <p>รหัสโต๊ะจะไม่ซ้ำภายในสาขา และใช้ระบุตัวตนเมื่อลูกค้าสแกน QR</p>
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
