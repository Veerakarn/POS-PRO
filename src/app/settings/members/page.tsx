import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { MembershipForm } from "@/components/commerce-forms";
import { requireOrganizationPermission } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function MembersPage() {
  await connection();
  const user = await requireOrganizationPermission("organization.manage");
  const [org, settings, members, entries] = await Promise.all([
    db.organization.findUnique({ where: { id: user.organizationId }, select: { name: true, branches: { take: 1, select: { name: true } } } }),
    db.membershipSettings.findUnique({ where: { organizationId: user.organizationId } }),
    db.customerMember.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true, name: true, phone: true, createdAt: true, isActive: true } }),
    db.loyaltyEntry.groupBy({ by: ["memberId"], where: { member: { organizationId: user.organizationId } }, _sum: { points: true } }),
  ]);
  const balance = new Map(entries.map((entry) => [entry.memberId, entry._sum.points ?? 0]));
  return <AppShell branchName={org?.branches[0]?.name} organizationName={org?.name} userName={user.displayName}><main className="branch-page">
    <header className="dashboard-header"><div><p className="eyebrow">Back Office · Loyalty</p><h1>สมาชิกและสะสมแต้ม</h1><p className="page-description">สมัครสมาชิกจาก POS ด้วยเบอร์มือถือ และสะสมแต้มอัตโนมัติเมื่อชำระบิลครบ</p></div></header>
    <section className="branch-layout"><article className="branch-panel"><div className="panel-heading"><div><p className="eyebrow">สมาชิก</p><h2>{members.length} ราย</h2></div></div>
      {members.length ? <div className="branch-list">{members.map((member) => <article className="branch-item" key={member.id}><div><strong>{member.name}</strong><p>{member.phone} · สมัคร {member.createdAt.toLocaleDateString("th-TH")}</p></div><span>{balance.get(member.id) ?? 0} แต้ม</span></article>)}</div> : <p className="empty-state">สมาชิกจะปรากฏเมื่อผูกสมาชิกกับบิลจากหน้า Counter POS</p>}
    </article><aside className="branch-create-card"><p className="eyebrow">กติกาคะแนน</p><h2>ตั้งค่าการสะสม/แลก</h2><MembershipForm defaults={{ earnEveryBaht: Math.max(1, Math.round((settings?.pointsPerHundredSatang ?? 10_000) / 100)), pointsPerInterval: settings?.pointsPerHundredBaht ?? 1, redemptionCapPercent: settings?.redemptionCapPercent ?? 50 }} /></aside></section>
  </main></AppShell>;
}
