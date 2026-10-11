import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { getPermissionScope, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { bangkokDateKey, reportPeriod } from "@/lib/report-period";

function money(satang: number) {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(satang / 100);
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ branch?: string; from?: string; to?: string }> }) {
  await connection();
  const [user, query] = await Promise.all([requirePermission("report.view"), searchParams]);
  const scope = getPermissionScope(user, "report.view");
  const branches = await db.branch.findMany({
    where: { organizationId: user.organizationId, ...(scope.allBranches ? {} : { id: { in: scope.branchIds } }) },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, organization: { select: { name: true } } },
  });
  if (!branches.length) redirect("/account/no-access");
  const selectedBranchId = query.branch === "all" ? "all" : branches.some((branch) => branch.id === query.branch) ? query.branch! : branches[0].id;
  const period = reportPeriod(query.from, query.to);
  const branchIds = selectedBranchId === "all" ? branches.map((branch) => branch.id) : [selectedBranchId];

  const [bills, refunds, payments, wasteMovements, openTables, pendingRequests] = await Promise.all([
    db.bill.findMany({
      where: { branchId: { in: branchIds }, status: { in: ["PAID", "REFUNDED"] }, createdAt: { gte: period.start, lt: period.endExclusive } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, branchId: true, createdAt: true, totalSatang: true, discountSatang: true,
        lines: { select: { nameSnapshot: true, quantity: true, subtotalSatang: true, orderItem: { select: { quantity: true, ingredientUsages: { select: { quantity: true, unitCostSatang: true } } } } } },
      },
    }),
    db.refund.findMany({
      where: { branchId: { in: branchIds }, status: "SUCCEEDED", createdAt: { gte: period.start, lt: period.endExclusive } },
      orderBy: { createdAt: "asc" },
      select: { amountSatang: true, createdAt: true, payment: { select: { method: true } } },
    }),
    db.payment.findMany({
      where: { bill: { branchId: { in: branchIds } }, status: { in: ["SUCCEEDED", "REFUNDED"] }, createdAt: { gte: period.start, lt: period.endExclusive } },
      select: { amountSatang: true, method: true },
    }),
    db.stockMovement.findMany({ where: { branchId: { in: branchIds }, type: "WASTE", createdAt: { gte: period.start, lt: period.endExclusive } }, select: { quantity: true, unitCostSatang: true } }),
    db.tableSession.count({ where: { branchId: { in: branchIds }, status: { in: ["OPEN", "CHECK_REQUESTED", "PAYMENT_IN_PROGRESS"] } } }),
    db.serviceRequest.count({ where: { branchId: { in: branchIds }, status: { in: ["OPEN", "ACKNOWLEDGED"] } } }),
  ]);

  const refundSatang = refunds.reduce((sum, refund) => sum + refund.amountSatang, 0);
  const grossSatang = bills.reduce((sum, bill) => sum + bill.totalSatang, 0);
  const netSatang = grossSatang - refundSatang;
  const discountSatang = bills.reduce((sum, bill) => sum + bill.discountSatang, 0);
  const costSatang = Math.round(bills.reduce((sum, bill) => sum + bill.lines.reduce((lineSum, line) => {
    const ratio = line.orderItem.quantity ? line.quantity / line.orderItem.quantity : 0;
    return lineSum + line.orderItem.ingredientUsages.reduce((usageSum, usage) => usage.unitCostSatang === null ? usageSum : usageSum + Number(usage.quantity) * Number(usage.unitCostSatang) * ratio, 0);
  }, 0), 0));
  const wasteCostSatang = Math.round(wasteMovements.reduce((sum, movement) => movement.unitCostSatang === null ? sum : sum + Math.abs(Number(movement.quantity)) * Number(movement.unitCostSatang), 0));

  const daily = new Map<string, number>();
  const menuSales = new Map<string, { quantity: number; amount: number }>();
  const paymentSales = new Map<string, number>();
  for (const bill of bills) {
    const date = bangkokDateKey(bill.createdAt);
    daily.set(date, (daily.get(date) ?? 0) + bill.totalSatang);
    for (const line of bill.lines) {
      const current = menuSales.get(line.nameSnapshot) ?? { quantity: 0, amount: 0 };
      menuSales.set(line.nameSnapshot, { quantity: current.quantity + line.quantity, amount: current.amount + line.subtotalSatang });
    }
  }
  for (const payment of payments) paymentSales.set(payment.method, (paymentSales.get(payment.method) ?? 0) + payment.amountSatang);
  for (const refund of refunds) {
    const date = bangkokDateKey(refund.createdAt);
    daily.set(date, (daily.get(date) ?? 0) - refund.amountSatang);
    paymentSales.set(refund.payment.method, (paymentSales.get(refund.payment.method) ?? 0) - refund.amountSatang);
  }
  const dailyRows = [...daily.entries()].sort(([a], [b]) => a.localeCompare(b));
  const maxDaily = Math.max(1, ...dailyRows.map(([, amount]) => Math.abs(amount)));
  const topMenus = [...menuSales.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 10);
  const exportQuery = new URLSearchParams({ branch: selectedBranchId, from: period.from, to: period.to });
  const selectedName = selectedBranchId === "all" ? "ทุกสาขา" : branches.find((branch) => branch.id === selectedBranchId)?.name ?? branches[0].name;

  return <AppShell branchName={selectedName} organizationName={branches[0].organization.name} userName={user.displayName}>
    <main className="branch-page reports-page">
      <header className="dashboard-header"><div><p className="eyebrow">Sales · Cost · Operations</p><h1>รายงานร้าน</h1><p className="page-description">ยอดขายสุทธิ ส่วนลด คืนเงิน ต้นทุนตามสูตร ของเสีย และประสิทธิภาพเมนู</p></div><div className="report-header-actions"><Link className="secondary-button" href="/audit">ประวัติการทำรายการ</Link><a className="primary-button" href={`/reports/export?${exportQuery.toString()}`}>ดาวน์โหลด CSV</a></div></header>
      <form className="report-filter" method="get"><label><span>สาขา</span><select defaultValue={selectedBranchId} name="branch">{branches.length > 1 ? <option value="all">ทุกสาขา</option> : null}{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label><span>ตั้งแต่วันที่</span><input defaultValue={period.from} name="from" type="date" /></label><label><span>ถึงวันที่</span><input defaultValue={period.to} name="to" type="date" /></label><button className="primary-button" type="submit">ดูรายงาน</button></form>
      <section className="report-metrics"><article><span>ยอดขายสุทธิ</span><strong>{money(netSatang)}</strong><small>{bills.length} บิล · หักคืนตามวันที่คืนจริง</small></article><article><span>ส่วนลด</span><strong>{money(discountSatang)}</strong><small>รวมในยอดบิลแล้ว</small></article><article><span>คืนเงิน</span><strong>{money(refundSatang)}</strong><small>รายการคืนในช่วงที่เลือก</small></article><article><span>ต้นทุนตามสูตร</span><strong>{money(costSatang)}</strong><small>กำไรขั้นต้นประมาณ {money(netSatang - costSatang)}</small></article><article><span>ต้นทุนของเสีย</span><strong>{money(wasteCostSatang)}</strong><small>จากรายการของเสีย</small></article><article><span>สถานะหน้าร้าน</span><strong>{openTables} โต๊ะ</strong><small>คำขอค้าง {pendingRequests}</small></article></section>
      <section className="report-grid"><article className="report-panel"><header><div><p className="eyebrow">Daily net sales</p><h2>ยอดขายสุทธิรายวัน</h2></div></header>{dailyRows.length ? <div className="report-bars">{dailyRows.map(([date, amount]) => <div className="report-bar-row" key={date}><span>{new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00+07:00`))}</span><div><i style={{ width: `${Math.max(2, Math.abs(amount) / maxDaily * 100)}%` }} /></div><strong>{money(amount)}</strong></div>)}</div> : <p className="empty-state">ยังไม่มียอดขายในช่วงนี้</p>}</article><article className="report-panel"><header><div><p className="eyebrow">Payment mix</p><h2>ยอดรับตามช่องทาง</h2></div></header><div className="report-ranking">{[...paymentSales.entries()].sort((a, b) => b[1] - a[1]).map(([method, amount]) => <div key={method}><span>{method}</span><strong>{money(amount)}</strong></div>)}{!paymentSales.size ? <p className="empty-state">ยังไม่มีการชำระเงิน</p> : null}</div></article></section>
      <section className="report-panel top-menu-panel"><header><div><p className="eyebrow">Top menu</p><h2>เมนูขายดี</h2></div></header>{topMenus.length ? <div className="report-table-wrap"><table className="report-table"><thead><tr><th>อันดับ</th><th>เมนู</th><th>จำนวน</th><th>ยอดก่อนส่วนลด</th></tr></thead><tbody>{topMenus.map(([name, sale], index) => <tr key={name}><td>{index + 1}</td><td>{name}</td><td>{sale.quantity}</td><td>{money(sale.amount)}</td></tr>)}</tbody></table></div> : <p className="empty-state">ยังไม่มีรายการขาย</p>}</section>
    </main>
  </AppShell>;
}
