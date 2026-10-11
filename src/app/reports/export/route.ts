import { getPermissionScope, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { reportPeriod } from "@/lib/report-period";

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(request: Request) {
  const user = await requirePermission("report.view");
  const scope = getPermissionScope(user, "report.view");
  const url = new URL(request.url);
  const requestedBranch = url.searchParams.get("branch") ?? "all";
  const period = reportPeriod(url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined);
  const branches = await db.branch.findMany({ where: { organizationId: user.organizationId, ...(scope.allBranches ? {} : { id: { in: scope.branchIds } }) }, select: { id: true, name: true } });
  const branchIds = requestedBranch === "all" ? branches.map((branch) => branch.id) : branches.some((branch) => branch.id === requestedBranch) ? [requestedBranch] : [];
  if (!branchIds.length) return new Response("ไม่พบสาขาที่ได้รับสิทธิ์", { status: 403 });
  const [bills, refunds] = await Promise.all([
    db.bill.findMany({
      where: { branchId: { in: branchIds }, status: { in: ["PAID", "REFUNDED"] }, createdAt: { gte: period.start, lt: period.endExclusive } },
      select: { billNumber: true, createdAt: true, totalSatang: true, discountSatang: true, status: true, branch: { select: { name: true } }, tableSession: { select: { table: { select: { name: true } } } }, payments: { where: { status: { in: ["SUCCEEDED", "REFUNDED"] } }, select: { method: true } } },
    }),
    db.refund.findMany({
      where: { branchId: { in: branchIds }, status: "SUCCEEDED", createdAt: { gte: period.start, lt: period.endExclusive } },
      select: { createdAt: true, amountSatang: true, reason: true, branch: { select: { name: true } }, bill: { select: { billNumber: true, status: true, tableSession: { select: { table: { select: { name: true } } } } } }, payment: { select: { method: true } } },
    }),
  ]);
  const events = [
    ...bills.map((bill) => ({
      at: bill.createdAt,
      row: [bill.createdAt.toISOString(), "ขาย", bill.branch.name, bill.billNumber, bill.tableSession.table.name, bill.status, [...new Set(bill.payments.map((payment) => payment.method))].join(" + "), (bill.totalSatang / 100).toFixed(2), (bill.discountSatang / 100).toFixed(2), "0.00", (bill.totalSatang / 100).toFixed(2), ""],
    })),
    ...refunds.map((refund) => ({
      at: refund.createdAt,
      row: [refund.createdAt.toISOString(), "คืนเงิน", refund.branch.name, refund.bill.billNumber, refund.bill.tableSession.table.name, refund.bill.status, refund.payment.method, "0.00", "0.00", (refund.amountSatang / 100).toFixed(2), (-refund.amountSatang / 100).toFixed(2), refund.reason],
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const rows = [
    ["วันที่เวลา", "ประเภทรายการ", "สาขา", "เลขบิล", "โต๊ะ", "สถานะ", "ช่องทาง", "ยอดบิลบาท", "ส่วนลดบาท", "คืนเงินบาท", "ยอดสุทธิบาท", "เหตุผล"],
    ...events.map((event) => event.row),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="pos-report-${period.from}-${period.to}.csv"`, "Cache-Control": "private, no-store" } });
}
