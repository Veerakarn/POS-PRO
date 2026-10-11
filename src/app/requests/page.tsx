import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { RequestAutoRefresh } from "@/components/request-auto-refresh";
import { ServiceRequestActions } from "@/components/service-request-actions";
import { getPermissionScope, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

function requestLabel(type: "STAFF_CALL" | "CHECK_BILL") {
  return type === "STAFF_CALL" ? "เรียกพนักงาน" : "ขอเช็กบิล";
}

function requestStatusLabel(status: string) {
  return status === "OPEN" ? "รอรับเรื่อง" : "รับเรื่องแล้ว · กำลังดำเนินการ";
}

function formatRequestTime(date: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

export default async function RequestsPage() {
  await connection();
  const user = await requirePermission("service.manage");
  const scope = getPermissionScope(user, "service.manage");
  const [organization, requests] = await Promise.all([
    db.organization.findUnique({
      where: { id: user.organizationId },
      select: {
        name: true,
        branches: {
          where: !scope.allBranches ? { id: { in: scope.branchIds } } : undefined,
          take: 1,
          orderBy: { createdAt: "asc" },
          select: { name: true },
        },
      },
    }),
    db.serviceRequest.findMany({
      where: {
        branch: { organizationId: user.organizationId },
        ...(!scope.allBranches ? { branchId: { in: scope.branchIds } } : {}),
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
        table: { select: { name: true, code: true } },
        branch: { select: { name: true } },
      },
    }),
  ]);

  if (!organization) return null;

  return (
    <AppShell branchName={organization.branches[0]?.name} organizationName={organization.name} userName={user.displayName}>
      <main className="branch-page requests-page">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Front of house · Live requests</p>
            <h1>คำขอจากโต๊ะ</h1>
            <p className="page-description">รับเรื่องเรียกพนักงานและเช็กบิลจากลูกค้าที่สแกน QR</p>
            <RequestAutoRefresh />
          </div>
          <span className="request-total">{requests.length} รายการรอดำเนินการ</span>
        </header>
        {requests.length ? <section className="request-list">
          {requests.map((request) => (
            <article className="request-card" key={request.id}>
              <div className={`request-icon ${request.type === "CHECK_BILL" ? "bill" : "staff"}`}>{request.type === "CHECK_BILL" ? "฿" : "✦"}</div>
              <div className="request-copy">
                <p>{requestLabel(request.type)} · {requestStatusLabel(request.status)}</p>
                <h2>{request.table.name} <span>{request.table.code}</span></h2>
                <small>{request.branch.name} · {formatRequestTime(request.createdAt)} น.</small>
              </div>
              <ServiceRequestActions requestId={request.id} requestType={request.type} status={request.status} />
            </article>
          ))}
        </section> : <section className="empty-request-state"><span>✓</span><h2>ไม่มีคำขอค้างอยู่</h2><p>คำขอจาก QR ของลูกค้าจะแสดงในหน้านี้ทันที</p></section>}
      </main>
    </AppShell>
  );
}
