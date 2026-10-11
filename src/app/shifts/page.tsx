import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { ShiftManagement } from "@/components/shift-management";
import { getPermissionScope, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function ShiftsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  await connection();
  const [user, query] = await Promise.all([requirePermission("payment.manage"), searchParams]);
  const scope = getPermissionScope(user, "payment.manage");
  const branches = await db.branch.findMany({ where: { organizationId: user.organizationId, ...(scope.allBranches ? {} : { id: { in: scope.branchIds } }) }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const selected = branches.find((branch) => branch.id === query.branch) ?? branches[0];
  if (!selected) redirect("/account/no-access");
  const branch = await db.branch.findFirst({ where: { id: selected.id, organizationId: user.organizationId }, select: { organization: { select: { name: true } }, paymentMethods: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true, isCash: true, isActive: true } }, cashShifts: { orderBy: { openedAt: "desc" }, take: 30, select: { id: true, userId: true, status: true, openingCashSatang: true, expectedCashSatang: true, closingCashSatang: true, differenceSatang: true, note: true, openedAt: true, closedAt: true, user: { select: { displayName: true } } } } } });
  if (!branch) redirect("/account/no-access");
  const shifts = branch.cashShifts.map((shift) => ({ ...shift, openedAt: shift.openedAt.toISOString(), closedAt: shift.closedAt?.toISOString() ?? null, userName: shift.user.displayName }));
  return <AppShell branchName={selected.name} organizationName={branch.organization.name} userName={user.displayName}><main className="branch-page shifts-page"><header className="dashboard-header"><div><p className="eyebrow">Cash control · Payment setup</p><h1>กะเงินสดและช่องทางชำระ</h1><p className="page-description">เปิด–ปิดกะ นับเงินสด ตรวจส่วนต่าง และกำหนดวิธีรับชำระของแต่ละสาขา</p></div><Link className="primary-button compact" href={`/pos/${selected.id}`}>เปิด Counter POS</Link></header>{branches.length > 1 ? <nav className="branch-switcher" aria-label="เลือกสาขา">{branches.map((item) => <Link className={item.id === selected.id ? "filter-button active" : "filter-button"} href={`/shifts?branch=${encodeURIComponent(item.id)}`} key={item.id}>{item.name}</Link>)}</nav> : null}<ShiftManagement branchId={selected.id} currentShift={shifts.find((shift) => shift.userId === user.id && shift.status === "OPEN") ?? null} methods={branch.paymentMethods} shifts={shifts} /></main></AppShell>;
}
