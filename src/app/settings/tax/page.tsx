import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { TaxProfileForm } from "@/components/commerce-forms";
import { requireAuthenticatedUser } from "@/lib/auth";
import { userHasPermission } from "@/lib/authorization";
import { db } from "@/lib/db";

export default async function TaxSettingsPage() {
  await connection();
  const user = await requireAuthenticatedUser();
  const branches = await db.branch.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, organization: { select: { name: true } }, taxProfile: true } });
  const permitted = branches.filter((branch) => userHasPermission(user.roleAssignments, "payment.manage", branch.id));
  const first = permitted[0] ?? branches[0];
  return <AppShell branchName={first?.name} organizationName={first?.organization.name} userName={user.displayName}><main className="branch-page">
    <header className="dashboard-header"><div><p className="eyebrow">Back Office · Tax</p><h1>ข้อมูลภาษีและใบกำกับภาษี</h1><p className="page-description">กำหนดข้อมูลผู้ขายแยกตามสาขา อัตราภาษีจะนำไปใช้กับบิลที่เปิดใหม่</p></div></header>
    {!permitted.length ? <section className="branch-panel"><p>บัญชีนี้ไม่มีสิทธิ์จัดการการชำระเงินในสาขา</p></section> : <div className="tax-branch-grid">{permitted.map((branch) => <section className="branch-panel" key={branch.id}><div className="panel-heading"><div><p className="eyebrow">สาขา</p><h2>{branch.name}</h2></div></div><TaxProfileForm branchId={branch.id} defaults={branch.taxProfile ? { legalName: branch.taxProfile.legalName, taxpayerId: branch.taxProfile.taxpayerId, address: branch.taxProfile.address, branchNumber: branch.taxProfile.branchNumber, isVatRegistered: branch.taxProfile.isVatRegistered, vatRatePercent: branch.taxProfile.vatRateBps / 100, taxIncluded: branch.taxProfile.taxIncluded, documentPrefix: branch.taxProfile.documentPrefix } : undefined} /></section>)}</div>}
    <section className="branch-panel tax-note"><h2>ข้อควรทราบเรื่องเอกสาร</h2><p>ระบบนี้สร้างใบกำกับภาษีแบบพิมพ์จากบิลที่ชำระครบ สำหรับสาขาที่ระบุว่าจด VAT แล้วเท่านั้น ข้อมูลผู้ซื้อจะต้องกรอกตอนออกเอกสาร ใบกำกับภาษีอิเล็กทรอนิกส์ไม่ได้อยู่ในขอบเขตหน้านี้</p></section>
  </main></AppShell>;
}
