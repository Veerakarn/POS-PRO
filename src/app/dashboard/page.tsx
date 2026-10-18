import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { getPermissionScope, requirePermission } from "@/lib/auth";
import { userHasPermission } from "@/lib/authorization";
import { db } from "@/lib/db";
import { formatBaht } from "@/lib/demo-data";

function formatActivityTime(date: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function activityTitle(action: string, branchName: string | null, actorName: string | null) {
  if (action === "organization.initialized") return "สร้างร้านและสาขาแรกแล้ว";
  if (action === "branch.created") return `เพิ่มสาขา${branchName ? ` ${branchName}` : ""}`;
  const labels: Record<string, string> = {
    "auth.login_succeeded": "พนักงานเข้าสู่ระบบ",
    "user.pin_changed": actorName ? `${actorName} เปลี่ยน PIN` : "มีการเปลี่ยน PIN",
    "table.created": "เพิ่มโต๊ะใหม่",
    "table.deactivated": "ปิดใช้งานโต๊ะ",
    "table.restored": "กู้คืนโต๊ะ",
    "branch.deleted": "ลบสาขา",
    "owner-registration": "สมัครเจ้าของร้าน",
    "user.created": "เพิ่มพนักงาน",
    "user.updated": "แก้ไขข้อมูลพนักงาน",
    "user.pin_reset": "ตั้ง PIN ใหม่ให้พนักงาน",
    "role.created": "สร้างบทบาทพนักงาน",
    "role.updated": "แก้ไขบทบาทพนักงาน",
    "payment.received_at_counter": "รับชำระเงินที่เคาน์เตอร์",
    "payment.refunded": "คืนเงินให้ลูกค้า",
    "bill.discount_applied": "ใช้ส่วนลดกับบิล",
    "bill.promotion_applied": "ใช้โปรโมชั่น",
    "bill.member_linked": "ผูกสมาชิกกับบิล",
    "bill.member_points_redeemed": "แลกแต้มสมาชิก",
    "bill.split_created": "สร้างบิลแยก",
    "bill.voided": "ยกเลิกบิล",
    "order_item.cancelled": "ยกเลิกรายการอาหาร",
    "table.moved": "ย้ายโต๊ะ",
    "table.merged": "รวมโต๊ะ",
    "table.check_bill_requested_from_counter": "เรียกเช็กบิล",
    "table.qr_reprinted_from_counter": "พิมพ์ QR โต๊ะซ้ำ",
    "ingredient.active_changed": "เปลี่ยนสถานะวัตถุดิบ",
    "recipe.updated": "แก้ไขสูตรอาหาร",
    "menu_category.created": "เพิ่มหมวดหมู่อาหาร",
    "menu_category.archived": "ปิดใช้งานหมวดหมู่",
    "menu_category.restored": "กู้คืนหมวดหมู่",
    "menu_item.created": "เพิ่มเมนู",
    "menu_item.updated": "แก้ไขเมนู",
    "menu_item.archived": "ซ่อนเมนู",
    "membership.settings_updated": "เปลี่ยนกติกาสะสมแต้ม",
    "user.deactivated": "ปิดใช้งานบัญชีผู้ใช้",
    "user.activated": "เปิดใช้งานบัญชีผู้ใช้",
    "role_assignment.created": "มอบหมายบทบาทให้พนักงาน",
    "role_assignment.scope_changed": "เปลี่ยนขอบเขตสาขาของบทบาทพนักงาน",
    "role_assignment.removed": "ถอดบทบาทของพนักงาน",
    "cash_shift.opened": "เปิดกะเงินสด",
    "cash_shift.closed": "ปิดกะเงินสด",
    "table.opened_from_counter": "เปิดโต๊ะจาก Counter POS",
    "order.submitted_from_counter": "ส่งออเดอร์จาก Counter POS",
    "order.submitted_from_qr": "ลูกค้าส่งออเดอร์ผ่าน QR",
    "production_station.created": "เพิ่มจุดเตรียมอาหาร",
    "menu_item.routed_to_station": "กำหนดจุดเตรียมเมนู",
    "payment_method.created": "เพิ่มช่องทางชำระเงิน",
    "print_agent.created": "เพิ่มตัวเชื่อมต่อเครื่องพิมพ์",
    "print_agent.token_rotated": "เปลี่ยนรหัสเชื่อมต่อเครื่องพิมพ์",
    "print_job.test_queued": "ส่งงานทดสอบไปเครื่องพิมพ์",
    "print_job.retried": "ส่งงานพิมพ์ซ้ำ",
    "print_job.reprinted": "พิมพ์เอกสารซ้ำ",
    "print_route.created": "เพิ่มเส้นทางงานพิมพ์",
    "print_route.deleted": "ลบเส้นทางงานพิมพ์",
    "qr-order": "ลูกค้าส่งออเดอร์ผ่าน QR",
    "qr-service": "ลูกค้าส่งคำขอผ่าน QR",
  };
  return labels[action] ?? "มีกิจกรรมในระบบ";
}

export default async function DashboardPage() {
  await connection();
  const user = await requirePermission("report.view");
  const scope = getPermissionScope(user, "report.view");
  const allowedBranchIds = scope.branchIds;

  const [organization, paidBills, menuCount, activity, pendingServiceRequests] = await Promise.all([
    db.organization.findUnique({
      where: { id: user.organizationId },
      select: {
        name: true,
        branches: {
          where: scope.allBranches ? undefined : { id: { in: allowedBranchIds } },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
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
    }),
    db.bill.findMany({
      where: {
        branchId: scope.allBranches ? undefined : { in: allowedBranchIds },
        branch: { organizationId: user.organizationId },
        status: { in: ["PAID", "REFUNDED"] },
      },
      select: { totalSatang: true, refunds: { where: { status: "SUCCEEDED" }, select: { amountSatang: true } } },
    }),
    db.menuItem.count({ where: { organizationId: user.organizationId, isActive: true, category: { isActive: true } } }),
    db.auditLog.findMany({
      where: {
        organizationId: user.organizationId,
        branchId: scope.allBranches ? undefined : { in: allowedBranchIds },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        action: true,
        createdAt: true,
        branch: { select: { name: true } },
        actor: { select: { displayName: true } },
      },
    }),
    db.serviceRequest.count({
      where: {
        branchId: scope.allBranches ? undefined : { in: allowedBranchIds },
        branch: { organizationId: user.organizationId },
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
      },
    }),
  ]);

  if (!organization) redirect("/setup");

  const primaryBranch = organization.branches[0];
  const tableCount = organization.branches.reduce((total, branch) => total + branch._count.tables, 0);
  const paidSalesTotal = paidBills.reduce((sum, bill) => sum + bill.totalSatang - bill.refunds.reduce((refundSum, refund) => refundSum + refund.amountSatang, 0), 0);
  const hasTables = tableCount > 0;
  const hasMenu = menuCount > 0;
  const hasProduction = organization.branches.some((branch) => branch._count.stations > 0 && branch._count.printers > 0);
  const setupCompleted = [true, hasTables, hasMenu, hasProduction].filter(Boolean).length;
  const metrics = [
    { label: "ยอดขายที่ชำระแล้ว", value: formatBaht(paidSalesTotal), change: "เฉพาะสาขาที่ได้รับสิทธิ์", href: userHasPermission(user.roleAssignments, "payment.manage") ? "/sales" : "/reports" },
    { label: "สาขาที่ดูแล", value: String(organization.branches.length), change: scope.allBranches ? "ทุกสาขาในองค์กร" : "ตามสิทธิ์ที่ได้รับ", href: userHasPermission(user.roleAssignments, "branch.manage") ? "/settings/branches" : null },
    { label: "โต๊ะที่ตั้งค่าแล้ว", value: String(tableCount), change: "พร้อมเปิดใช้งาน Counter POS", href: userHasPermission(user.roleAssignments, "table.manage") ? "/settings/tables" : userHasPermission(user.roleAssignments, "pos.use") ? "/pos" : null },
    { label: "คำขอจากโต๊ะ", value: String(pendingServiceRequests), change: "เรียกพนักงานและเช็กบิล", href: userHasPermission(user.roleAssignments, "service.manage") ? "/requests" : null },
  ];

  return (
    <AppShell branchName={primaryBranch?.name} organizationName={organization.name} userName={user.displayName}>
      <main className="dashboard-page">
        <header className="dashboard-header dashboard-hero">
          <div>
            <p className="eyebrow">ภาพรวมร้าน</p>
            <h1>สวัสดี, {user.displayName}</h1>
            <p className="dashboard-intro">ติดตามยอดขาย โต๊ะ และความเคลื่อนไหวของร้านได้ในที่เดียว</p>
          </div>
          {userHasPermission(user.roleAssignments, "branch.manage") ? (
            <Link className="secondary-button" href="/settings/branches">จัดการสาขา</Link>
          ) : null}
        </header>
        <section className="metric-grid">
          {metrics.map((metric) => {
            const content = <><p>{metric.label}</p><strong>{metric.value}</strong><span>{metric.change}</span></>;
            return metric.href ? (
              <Link className="metric-card metric-card-link" href={metric.href} key={metric.label}>{content}</Link>
            ) : (
              <article className="metric-card" key={metric.label}>{content}</article>
            );
          })}
        </section>
        <section className="dashboard-grid">
          <article className="dashboard-panel setup-progress-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">เริ่มใช้งานสาขา</p><h2>ลำดับถัดไป</h2></div>
              <span className="metric-highlight">{setupCompleted} / 4 เสร็จแล้ว</span>
            </div>
            <ol className="setup-checklist">
              <li className="complete"><span>1</span><div><strong>สร้างร้านและสาขา</strong><small>บันทึกลงฐานข้อมูลกลางแล้ว</small></div></li>
              <li className={hasTables ? "complete" : undefined}><span>2</span><div><strong>เพิ่มโต๊ะและ QR</strong><small>สร้างรหัสโต๊ะและลิงก์สั่งอาหารของสาขา</small></div></li>
              <li className={hasMenu ? "complete" : undefined}><span>3</span><div><strong>สร้างหมวดหมู่และเมนู</strong><small>กำหนดราคา เส้นทางครัว และต้นทุน</small></div></li>
              <li className={hasProduction ? "complete" : undefined}><span>4</span><div><strong>กำหนดจุดผลิตและเครื่องพิมพ์</strong><small>เชื่อม USB หรือ Network ผ่าน Print Agent</small></div></li>
            </ol>
          </article>
          <article className="dashboard-panel activity-panel">
            <div className="panel-heading"><div><p className="eyebrow">บันทึกกิจกรรม</p><h2>การเปลี่ยนแปลงล่าสุด</h2></div></div>
            <div className="activity-list">
              {activity.length ? activity.map((item) => (
                <div className="activity-item" key={item.id}>
                  <span className="activity-dot success" />
                  <div><strong>{activityTitle(item.action, item.branch?.name ?? null, item.actor?.displayName ?? null)}</strong><small>{formatActivityTime(item.createdAt)}</small></div>
                </div>
              )) : <p className="empty-state">ยังไม่มีกิจกรรมในระบบ</p>}
            </div>
          </article>
        </section>
      </main>
    </AppShell>
  );
}
