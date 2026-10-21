import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { getPermissionScope, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

const actionLabels: Record<string, string> = {
  "organization.initialized": "สร้างร้านและสาขาแรก",
  "branch.created": "เพิ่มสาขา",
  "branch.deleted": "ลบสาขา",
  "auth.login_succeeded": "เข้าสู่ระบบสำเร็จ",
  "owner-registration": "สมัครเจ้าของร้าน",
  "user.created": "เพิ่มพนักงาน",
  "user.updated": "แก้ไขข้อมูลพนักงาน",
  "user.pin_changed": "เปลี่ยน PIN",
  "user.pin_reset": "ตั้ง PIN ใหม่ให้พนักงาน",
  "role.created": "สร้างบทบาทพนักงาน",
  "role.updated": "แก้ไขบทบาทพนักงาน",
  "role_assignment.created": "มอบหมายบทบาทให้พนักงาน",
  "role_assignment.scope_changed": "เปลี่ยนขอบเขตสาขาของบทบาทพนักงาน",
  "role_assignment.removed": "นำบทบาทออกจากพนักงาน",
  "payment.received_at_counter": "รับชำระเงิน",
  "payment.refunded": "คืนเงิน",
  "bill.discount_applied": "ใช้ส่วนลด",
  "bill.promotion_applied": "ใช้โปรโมชั่น",
  "bill.member_linked": "ผูกสมาชิกกับบิล",
  "bill.member_points_redeemed": "แลกแต้มสมาชิก",
  "bill.split_created": "สร้างบิลแยก",
  "bill.voided": "ยกเลิกบิล",
  "order_item.cancelled": "ยกเลิกรายการอาหาร",
  "kitchen.order_status_updated": "อัปเดตสถานะอาหารจากครัว",
  "kitchen.tracking_changed": "เปิด–ปิดการติดตามสถานะอาหาร",
  "table.opened_from_counter": "เปิดโต๊ะ",
  "table.moved": "ย้ายโต๊ะ",
  "table.merged": "รวมโต๊ะ",
  "table.check_bill_requested_from_counter": "เรียกเช็กบิล",
  "table.qr_reprinted_from_counter": "พิมพ์ QR โต๊ะซ้ำ",
  "cash_shift.opened": "เปิดกะเงินสด",
  "cash_shift.closed": "ปิดกะเงินสด",
  "order.submitted_from_counter": "ส่งออเดอร์จากเคาน์เตอร์",
  "order.submitted_from_qr": "ลูกค้าส่งออเดอร์ผ่าน QR",
  "ingredient.active_changed": "เปลี่ยนสถานะวัตถุดิบ",
  "recipe.updated": "แก้ไขสูตรอาหาร",
  "menu_category.created": "เพิ่มหมวดหมู่อาหาร",
  "membership.settings_updated": "เปลี่ยนกติกาสะสมแต้ม",
  "user.deactivated": "ปิดใช้งานบัญชีผู้ใช้",
  "user.activated": "เปิดใช้งานบัญชีผู้ใช้",
  "menu_item.created": "เพิ่มเมนู",
  "menu_item.updated": "แก้ไขเมนู",
  "menu_item.archived": "ซ่อนเมนู",
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
  "table.created": "เพิ่มโต๊ะ",
  "qr-order": "ลูกค้าส่งออเดอร์ผ่าน QR",
  "qr-service": "ลูกค้าส่งคำขอผ่าน QR",
};

const entityLabels: Record<string, string> = {
  Organization: "ร้าน",
  Branch: "สาขา",
  User: "พนักงาน",
  Role: "บทบาทพนักงาน",
  RoleAssignment: "สิทธิ์พนักงาน",
  Bill: "บิล",
  Payment: "การชำระเงิน",
  Refund: "การคืนเงิน",
  TableSession: "รอบการใช้โต๊ะ",
  RestaurantTable: "โต๊ะ",
  Order: "ออเดอร์",
  OrderItem: "รายการอาหาร",
  CashShift: "กะเงินสด",
  Ingredient: "วัตถุดิบ",
  Recipe: "สูตรอาหาร",
  MenuItem: "เมนู",
  MenuCategory: "หมวดหมู่อาหาร",
  MembershipSettings: "กติกาสมาชิกและแต้ม",
  ProductionStation: "จุดเตรียมอาหาร",
  PaymentMethodSetting: "ช่องทางชำระเงิน",
  PrintAgent: "ตัวเชื่อมต่อเครื่องพิมพ์",
  PrintJob: "งานพิมพ์",
  PrintRoutingRule: "เส้นทางงานพิมพ์",
};

const fieldLabels: Record<string, string> = {
  name: "ชื่อ",
  displayName: "ชื่อพนักงาน",
  email: "อีเมล",
  phone: "เบอร์โทรศัพท์",
  description: "รายละเอียด",
  reason: "เหตุผล",
  status: "สถานะ",
  isActive: "สถานะการใช้งาน",
  mustChangePin: "ต้องเปลี่ยน PIN",
  roleName: "บทบาท",
  branchName: "สาขา",
  tableName: "โต๊ะ",
  billNumber: "เลขที่บิล",
  code: "รหัส",
  method: "ช่องทางชำระเงิน",
  amountSatang: "จำนวนเงิน",
  openingCashSatang: "เงินสดตั้งต้น",
  expectedCashSatang: "เงินสดที่ควรมี",
  closingCashSatang: "เงินสดที่นับได้",
  differenceSatang: "เงินสดส่วนต่าง",
  cashIn: "เงินสดรับเข้า",
  cashOut: "เงินสดจ่ายออก",
  quantity: "จำนวน",
  earnEveryBaht: "ยอดซื้อที่กำหนด (บาท)",
  pointsPerInterval: "แต้มที่ได้รับ",
  redemptionCapPercent: "เพดานแลกแต้ม (% ของบิล)",
  balanceAfter: "ยอดคงเหลือหลังทำรายการ",
  unit: "หน่วย",
  kind: "ประเภท",
  value: "มูลค่าส่วนลด",
  permissions: "สิทธิ์การใช้งาน",
  copies: "จำนวนสำเนา",
  documentType: "ประเภทเอกสาร",
  paperWidth: "หน้ากระดาษ",
  connection: "การเชื่อมต่อ",
  endpoint: "ที่อยู่เครื่องพิมพ์",
  printQueued: "จำนวนงานพิมพ์ที่ส่งแล้ว",
  stockRestored: "คืนวัตถุดิบเข้าสต็อกแล้ว",
  closedSession: "ปิดรอบโต๊ะแล้ว",
  lines: "รายการวัตถุดิบ",
  selections: "รายการที่เลือก",
};

const valueLabels: Record<string, string> = {
  OPEN: "เปิดอยู่",
  CLOSED: "ปิดแล้ว",
  CANCELLED: "ยกเลิกแล้ว",
  ACTIVE: "เปิดใช้งาน",
  INACTIVE: "ปิดใช้งาน",
  CASH: "เงินสด",
  CARD: "บัตรเครดิต/เดบิต",
  QR_PAYMENT: "โอนเงิน",
  BANK_TRANSFER: "โอนเงิน",
  OTHER: "ช่องทางอื่น",
  FIXED: "ลดเป็นจำนวนเงิน",
  PERCENT: "ลดเป็นเปอร์เซ็นต์",
  COUNTER: "เคาน์เตอร์",
  QR: "QR โต๊ะ",
  PREPARING: "กำลังเตรียม",
  READY: "พร้อมเสิร์ฟ",
  PARTIALLY_PAID: "ชำระแล้วบางส่วน",
  PAID: "ชำระครบแล้ว",
  REFUNDED: "คืนเงินแล้ว",
  SUCCEEDED: "สำเร็จ",
  FAILED: "ไม่สำเร็จ",
  QUEUED: "รอดำเนินการ",
  KG: "กิโลกรัม",
  GRAM: "กรัม",
  LITER: "ลิตร",
  PIECE: "ชิ้น",
};

function fieldLabel(key: string) {
  return fieldLabels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
}

function readableValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "ไม่มีข้อมูล";
  if (/id$/i.test(key)) return "เชื่อมโยงรายการแล้ว";
  if (typeof value === "boolean") {
    if (key === "isActive") return value ? "เปิดใช้งาน" : "ปิดใช้งาน";
    if (key === "stockRestored") return value ? "ใช่" : "ไม่ใช่";
    return value ? "ใช่" : "ไม่ใช่";
  }
  if (typeof value === "number" && /Satang$/.test(key)) {
    return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(value / 100);
  }
  if (typeof value === "string") {
    if (/Satang$/.test(key) && /^-?\d+(\.\d+)?$/.test(value)) {
      return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(Number(value) / 100);
    }
    if (/^[a-z0-9_-]{20,}$/i.test(value)) return "บันทึกแล้ว";
    return valueLabels[value] ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === "object" && item !== null
      ? Object.entries(item).map(([childKey, childValue]) => `${fieldLabel(childKey)}: ${readableValue(childKey, childValue)}`).join(" · ")
      : readableValue("", item)).join("、");
  }
  if (typeof value === "object") {
    return Object.entries(value).map(([childKey, childValue]) => `${fieldLabel(childKey)}: ${readableValue(childKey, childValue)}`).join(" · ");
  }
  return String(value);
}

function ReadableAuditData({ value }: { value: unknown }) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return <p className="audit-readable-value">{readableValue("", value)}</p>;
  }
  const entries = Object.entries(value).filter(([key]) => !/id$/i.test(key) && key !== "code");
  if (!entries.length) return <p className="audit-readable-value">บันทึกรายการแล้ว</p>;
  return <dl className="audit-readable-data">{entries.map(([key, item]) => <div key={key}><dt>{fieldLabel(key)}</dt><dd>{readableValue(key, item)}</dd></div>)}</dl>;
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
      <section className="audit-list">{logs.length ? logs.map((log) => <article className="audit-card" key={log.id}><div className="audit-time"><strong>{new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Bangkok" }).format(log.createdAt)}</strong><span>{log.branch?.name ?? "ระดับองค์กร"}</span></div><div className="audit-main"><h2>{actionLabels[log.action] ?? "ทำรายการในระบบ"}</h2><p>{log.actor ? `${log.actor.displayName} · ${log.actor.email}` : "ระบบ / ลูกค้า QR"}</p><small>{entityLabels[log.entityType] ?? "รายการ"}</small>{log.reason ? <blockquote>เหตุผล: {log.reason}</blockquote> : null}</div>{log.before || log.after ? <details><summary>ดูรายละเอียดการเปลี่ยนแปลง</summary>{log.before ? <section className="audit-change"><b>ก่อนทำรายการ</b><ReadableAuditData value={log.before} /></section> : null}{log.after ? <section className="audit-change"><b>หลังทำรายการ</b><ReadableAuditData value={log.after} /></section> : null}</details> : null}</article>) : <p className="empty-state">ไม่พบประวัติตามเงื่อนไข</p>}</section>
      <nav className="audit-pagination" aria-label="หน้าประวัติ">{page > 1 ? <Link className="secondary-button" href={`/audit?${params(page - 1)}`}>ก่อนหน้า</Link> : <span /> }<span>หน้า {page} · ทั้งหมด {count} รายการ</span>{page * 50 < count ? <Link className="secondary-button" href={`/audit?${params(page + 1)}`}>ถัดไป</Link> : <span />}</nav>
    </main>
  </AppShell>;
}
