import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { PromoForm } from "@/components/commerce-forms";
import { DisablePromoForm } from "@/components/disable-promo-form";
import { requireOrganizationPermission } from "@/lib/auth";
import { db } from "@/lib/db";

const baht = (n: number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(n / 100);
export default async function PromotionsPage() {
  await connection();
  const user = await requireOrganizationPermission("organization.manage");
  const org = await db.organization.findUnique({ where: { id: user.organizationId }, select: { name: true, branches: { take: 1, select: { name: true } } } });
  const promos = await db.promoCode.findMany({ where: { organizationId: user.organizationId, isActive: true }, orderBy: { createdAt: "desc" }, select: { id: true, code: true, name: true, kind: true, value: true, minimumSatang: true, maximumDiscountSatang: true, usageLimit: true, startsAt: true, endsAt: true, _count: { select: { redemptions: true } } } });
  return <AppShell branchName={org?.branches[0]?.name} organizationName={org?.name} userName={user.displayName}><main className="branch-page">
    <header className="dashboard-header"><div><p className="eyebrow">Back Office · Sales</p><h1>โปรโมชั่น</h1><p className="page-description">สร้างรหัสส่วนลด ใช้ได้หนึ่งรหัสต่อบิล พร้อมบันทึกประวัติการใช้</p></div></header>
    <section className="branch-layout"><article className="branch-panel"><div className="panel-heading"><div><p className="eyebrow">รหัสโปรโมชั่นที่เปิดใช้</p><h2>{promos.length} รายการ</h2></div></div>
      {promos.length ? <div className="branch-list">{promos.map((promo) => <article className="branch-item" key={promo.id}><div><strong>{promo.code} · {promo.name}</strong><p>{promo.kind === "PERCENT" ? `${promo.value / 100}%` : baht(promo.value)} · ขั้นต่ำ {baht(promo.minimumSatang)}{promo.maximumDiscountSatang ? ` · ลดสูงสุด ${baht(promo.maximumDiscountSatang)}` : ""}</p><small>ใช้แล้ว {promo._count.redemptions}{promo.usageLimit ? ` / ${promo.usageLimit}` : " ครั้ง"}{promo.endsAt ? ` · ถึง ${promo.endsAt.toLocaleDateString("th-TH")}` : ""}</small></div><DisablePromoForm id={promo.id} /></article>)}</div> : <p className="empty-state">ยังไม่มีโปรโมชั่นที่เปิดใช้งาน โปรโมชั่นที่ปิดแล้วจะยังอยู่ในประวัติบิล</p>}
    </article><aside className="branch-create-card"><p className="eyebrow">สร้างใหม่</p><h2>กำหนดสิทธิ์ส่วนลด</h2><PromoForm /></aside></section>
  </main></AppShell>;
}
