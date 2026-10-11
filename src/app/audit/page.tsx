import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { getPermissionScope, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

const actionLabels: Record<string, string> = {
  "auth.login_succeeded": "เข้าสู่ระบบสำเร็จ",
  "payment.received_at_counter": "รับชำระเงิน",
  "payment.refunded": "คืนเงิน",
  "bill.discount_applied": "ใช้ส่วนลด",
  "bill.split_created": "สร้างบิลแยก",
  "bill.voided": "ยกเลิกบิล",
  "order_item.cancelled": "ยกเลิกรายการอาหาร",
  "table.opened_from_counter": "เปิดโต๊ะ",
  "table.moved": "ย้ายโต๊ะ",
  "table.merged": "รวมโต๊ะ",
  "cash_shift.opened": "เปิดกะเงินสด",
  "cash_shift.closed": "ปิดกะเงินสด",
  "order.submitted_from_counter": "ส่งออเดอร์จากเคาน์เตอร์",
  "order.submitted_from_qr": "ลูกค้าส่งออเดอร์ผ่าน QR",
};

function json(value: unknown) {
  return value === null || value === undefined ? null : JSON.stringify(value, null, 2);
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ branch?: string; q?: string; page?: string }> }) {
  await connection();
  const [user, query] = await Promise.all([requirePermission("report.view"), searchParams]);
  const scope = getPermissionScope(user, "report.view");
  const branches = await db.branch.findMany({ where: { organizationId: user.organizationId, ...(scope.allBranches ? {} : { id: { in: scope.branchIds } }) }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, organization: { select: { name: true } } } });
  if (!branches.length) redirect("/account/no-access");
  const branchId = query.branch === "all" ? "all" : branches.some((branch) => branch.id === query.branch) ? query.branch! : "all";
  const q = (query.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(10_000, Number.parseInt(query.page ?? "1", 10) || 1));
  const where = { organizationId: user.organizationId, ...(branchId === "all" ? { branchId: scope.allBranches ? undefined : { in: scope.branchIds } } : { branchId }), ...(q ? { OR: [{ action: { contains: q, mode: "insensitive" as const } }, { entityType: { contains: q, mode: "insensitive" as const } }, { reason: { contains: q, mode: "insensitive" as const } }] } : {}) };
  const [logs, count] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50, skip: (page - 1) * 50, select: { id: true, action: true, entityType: true, entityId: true, reason: true, before: true, after: true, createdAt: true, branch: { select: { name: true } }, actor: { select: { displayName: true, email: true } } } }),
    db.auditLog.count({ where }),
  ]);
  const params = (nextPage: number) => new URLSearchParams({ branch: branchId, q, page: String(nextPage) }).toString();
  return <AppShell branchName={branchId === "all" ? "ทุกสาขา" : branches.find((branch) => branch.id === branchId)?.name} organizationName={branches[0].organization.name} userName={user.displayName}>
    <main className="branch-page audit-page"><header className="dashboard-header"><div><p className="eyebrow">Audit trail</p><h1>ประวัติการทำรายการ</h1><p className="page-description">ตรวจว่าใครทำอะไร ที่สาขาใด พร้อมเหตุผลและข้อมูลก่อน–หลังของรายการสำคัญ</p></div><Link className="secondary-button" href="/reports">กลับรายงาน</Link></header>
      <form className="report-filter audit-filter" method="get"><label><span>สาขา</span><select defaultValue={branchId} name="branch"><option value="all">ทุกสาขาที่ได้รับสิทธิ์</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label><span>ค้นหาการทำรายการ</span><input defaultValue={q} maxLength={80} name="q" placeholder="เช่น payment, Bill, เหตุผล" /></label><button className="primary-button" type="submit">ค้นหา</button></form>
      <section className="audit-list">{logs.length ? logs.map((log) => <article className="audit-card" key={log.id}><div className="audit-time"><strong>{new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Bangkok" }).format(log.createdAt)}</strong><span>{log.branch?.name ?? "ระดับองค์กร"}</span></div><div className="audit-main"><h2>{actionLabels[log.action] ?? log.action}</h2><p>{log.actor ? `${log.actor.displayName} · ${log.actor.email}` : "ระบบ / ลูกค้า QR"}</p><small>{log.entityType} · {log.entityId}</small>{log.reason ? <blockquote>เหตุผล: {log.reason}</blockquote> : null}</div>{log.before || log.after ? <details><summary>ดูข้อมูลก่อน–หลัง</summary>{log.before ? <><b>ก่อน</b><pre>{json(log.before)}</pre></> : null}{log.after ? <><b>หลัง</b><pre>{json(log.after)}</pre></> : null}</details> : null}</article>) : <p className="empty-state">ไม่พบประวัติตามเงื่อนไข</p>}</section>
      <nav className="audit-pagination" aria-label="หน้าประวัติ">{page > 1 ? <Link className="secondary-button" href={`/audit?${params(page - 1)}`}>ก่อนหน้า</Link> : <span /> }<span>หน้า {page} · ทั้งหมด {count} รายการ</span>{page * 50 < count ? <Link className="secondary-button" href={`/audit?${params(page + 1)}`}>ถัดไป</Link> : <span />}</nav>
    </main>
  </AppShell>;
}
