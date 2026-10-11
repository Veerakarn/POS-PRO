import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { PrinterManagement } from "@/components/printer-management";
import { getPermissionScope, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function PrintersPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  await connection();
  const [user, query] = await Promise.all([requirePermission("printer.manage"), searchParams]);
  const scope = getPermissionScope(user, "printer.manage");
  const branches = await db.branch.findMany({
    where: {
      organizationId: user.organizationId,
      ...(scope.allBranches ? {} : { id: { in: scope.branchIds } }),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, code: true },
  });
  const selected = branches.find((branch) => branch.id === query.branch) ?? branches[0];
  if (!selected) redirect("/account/no-access");

  const branch = await db.branch.findFirst({
    where: { id: selected.id, organizationId: user.organizationId },
    select: {
      organization: { select: { name: true } },
      printAgents: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, isActive: true, lastSeenAt: true, lastError: true, version: true } },
      printers: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, connection: true, endpoint: true, paperWidth: true, codePage: true, isActive: true, printAgentId: true, printAgent: { select: { name: true } } } },
      printRoutes: { where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true, documentType: true, copies: true, printer: { select: { name: true } }, station: { select: { name: true } } } },
      stations: { where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, kind: true } },
      printJobs: { orderBy: { createdAt: "desc" }, take: 50, select: { id: true, documentType: true, status: true, attempts: true, error: true, createdAt: true, printedAt: true, printer: { select: { name: true } } } },
    },
  });
  if (!branch) redirect("/account/no-access");

  return <AppShell branchName={selected.name} organizationName={branch.organization.name} userName={user.displayName}>
    <main className="branch-page printers-page">
      <header className="dashboard-header"><div><p className="eyebrow">Hardware · Print routing</p><h1>เครื่องพิมพ์และคิวงาน</h1><p className="page-description">เชื่อมเครื่องพิมพ์ความร้อน USB หรือ LAN แยกตามสาขา ครัว บาร์ และแคชเชียร์</p></div><Link className="secondary-button" href="/settings/stations">จัดการจุดผลิต</Link></header>
      {branches.length > 1 ? <nav aria-label="เลือกสาขา" className="branch-switcher">{branches.map((branch) => <Link className={branch.id === selected.id ? "filter-button active" : "filter-button"} href={`/settings/printers?branch=${encodeURIComponent(branch.id)}`} key={branch.id}>{branch.name}</Link>)}</nav> : null}
      <aside className="printer-install-note"><div><strong>ลำดับติดตั้งจริง</strong><span>สร้าง Agent → คัดลอก Token → เพิ่มและผูกเครื่องพิมพ์ → กำหนด Routing → กดทดสอบพิมพ์</span></div><code>print-agent/.env.example</code></aside>
      <PrinterManagement
        agents={branch.printAgents.map((agent) => ({ ...agent, lastSeenAt: agent.lastSeenAt?.toISOString() ?? null }))}
        branchId={selected.id}
        jobs={branch.printJobs.map((job) => ({ ...job, createdAt: job.createdAt.toISOString(), printedAt: job.printedAt?.toISOString() ?? null, printerName: job.printer.name }))}
        printers={branch.printers.map((printer) => ({ ...printer, printAgentName: printer.printAgent?.name ?? null }))}
        routes={branch.printRoutes.map((route) => ({ id: route.id, documentType: route.documentType, copies: route.copies, printerName: route.printer.name, stationName: route.station?.name ?? null }))}
        stations={branch.stations}
      />
    </main>
  </AppShell>;
}
