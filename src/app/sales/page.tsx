import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { SalesManagement, type SaleBill } from "@/components/sales-management";
import { getPermissionScope, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

const PAGE_SIZE = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function validDay(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  return Number.isNaN(new Date(`${value}T00:00:00+07:00`).getTime()) ? "" : value;
}

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ branch?: string; q?: string; from?: string; to?: string; page?: string }> }) {
  await connection();
  const [user, query] = await Promise.all([requirePermission("payment.manage"), searchParams]);
  const scope = getPermissionScope(user, "payment.manage");
  const branches = await db.branch.findMany({
    where: { organizationId: user.organizationId, ...(scope.allBranches ? {} : { id: { in: scope.branchIds } }) },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, organization: { select: { name: true } } },
  });
  const selected = branches.find((branch) => branch.id === query.branch) ?? branches[0];
  if (!selected) redirect("/account/no-access");

  const q = (query.q ?? "").trim().slice(0, 80);
  let from = validDay(query.from);
  let to = validDay(query.to);
  if (from && to && from > to) [from, to] = [to, from];
  const page = Math.max(1, Math.min(10_000, Number.parseInt(query.page ?? "1", 10) || 1));
  const createdAt: Prisma.DateTimeFilter | undefined = from || to ? {
    ...(from ? { gte: new Date(`${from}T00:00:00+07:00`) } : {}),
    ...(to ? { lt: new Date(new Date(`${to}T00:00:00+07:00`).getTime() + DAY_MS) } : {}),
  } : undefined;
  const billNumber = /^\d{1,9}$/.test(q) ? Number.parseInt(q, 10) : null;
  const where: Prisma.BillWhereInput = {
    branchId: selected.id,
    ...(createdAt ? { createdAt } : {}),
    ...(q ? { OR: [
      ...(billNumber === null ? [] : [{ billNumber }]),
      { tableSession: { table: { name: { contains: q, mode: "insensitive" } } } },
    ] } : {}),
  };
  const [rawBills, count] = await Promise.all([
    db.bill.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: { id: true, billNumber: true, status: true, subtotalSatang: true, discountSatang: true, taxSatang: true, totalSatang: true, createdAt: true, tableSession: { select: { table: { select: { name: true } } } }, lines: { select: { id: true, nameSnapshot: true, quantity: true, subtotalSatang: true } }, discounts: { orderBy: { createdAt: "asc" }, select: { id: true, amountSatang: true, reason: true } }, refunds: { where: { status: "SUCCEEDED" }, select: { amountSatang: true } }, payments: { where: { status: { in: ["SUCCEEDED", "REFUNDED"] } }, orderBy: { createdAt: "asc" }, select: { id: true, method: true, amountSatang: true, status: true, refunds: { where: { status: "SUCCEEDED" }, select: { amountSatang: true } } } } },
    }),
    db.bill.count({ where }),
  ]);
  const bills: SaleBill[] = rawBills.map((bill) => ({ id: bill.id, billNumber: bill.billNumber, status: bill.status, tableName: bill.tableSession.table.name, subtotalSatang: bill.subtotalSatang, discountSatang: bill.discountSatang, taxSatang: bill.taxSatang, totalSatang: bill.totalSatang, createdAt: bill.createdAt.toISOString(), lines: bill.lines.map((line) => ({ id: line.id, name: line.nameSnapshot, quantity: line.quantity, subtotalSatang: line.subtotalSatang })), discounts: bill.discounts, refundedSatang: bill.refunds.reduce((sum, refund) => sum + refund.amountSatang, 0), payments: bill.payments.map((payment) => ({ id: payment.id, method: payment.method, amountSatang: payment.amountSatang, status: payment.status, refundableSatang: payment.amountSatang - payment.refunds.reduce((sum, refund) => sum + refund.amountSatang, 0) })) }));
  const netSales = bills.filter((bill) => ["PAID", "REFUNDED"].includes(bill.status)).reduce((sum, bill) => sum + bill.totalSatang - bill.refundedSatang, 0);
  const params = ({ branch = selected.id, nextPage = 1 }: { branch?: string; nextPage?: number } = {}) => {
    const value = new URLSearchParams({ branch });
    if (q) value.set("q", q);
    if (from) value.set("from", from);
    if (to) value.set("to", to);
    if (nextPage > 1) value.set("page", String(nextPage));
    return value.toString();
  };
  return <AppShell branchName={selected.name} organizationName={selected.organization.name} userName={user.displayName}>
    <main className="branch-page sales-page">
      <header className="dashboard-header"><div><p className="eyebrow">Sales ledger · Refunds</p><h1>รายการขายและคืนเงิน</h1><p className="page-description">ค้นบิลย้อนหลัง ตรวจการชำระ ส่วนลด และคืนเงินพร้อมเก็บเหตุผลกับผู้ทำรายการ</p></div><div className="sales-header-total"><span>ยอดสุทธิจากหน้าที่แสดง</span><strong>{new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(netSales / 100)}</strong></div></header>
      {branches.length > 1 ? <nav className="branch-switcher" aria-label="เลือกสาขา">{branches.map((item) => <Link className={item.id === selected.id ? "filter-button active" : "filter-button"} href={`/sales?${params({ branch: item.id })}`} key={item.id}>{item.name}</Link>)}</nav> : null}
      <form className="report-filter sales-filter" method="get"><input name="branch" type="hidden" value={selected.id} /><label><span>เลขบิลหรือชื่อโต๊ะ</span><input defaultValue={q} maxLength={80} name="q" placeholder="เช่น 125 หรือ โต๊ะ A1" /></label><label><span>ตั้งแต่วันที่</span><input defaultValue={from} name="from" type="date" /></label><label><span>ถึงวันที่</span><input defaultValue={to} name="to" type="date" /></label><button className="primary-button" type="submit">ค้นหา</button><Link className="secondary-button" href={`/sales?branch=${encodeURIComponent(selected.id)}`}>ล้างตัวกรอง</Link></form>
      <SalesManagement bills={bills} branchId={selected.id} />
      <nav className="audit-pagination" aria-label="หน้ารายการขาย">{page > 1 ? <Link className="secondary-button" href={`/sales?${params({ nextPage: page - 1 })}`}>ก่อนหน้า</Link> : <span /> }<span>หน้า {page} · ทั้งหมด {count} บิล</span>{page * PAGE_SIZE < count ? <Link className="secondary-button" href={`/sales?${params({ nextPage: page + 1 })}`}>ถัดไป</Link> : <span />}</nav>
    </main>
  </AppShell>;
}
