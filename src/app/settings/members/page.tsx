import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { MembershipForm } from "@/components/commerce-forms";
import { requireOrganizationPermission } from "@/lib/auth";
import { db } from "@/lib/db";

type MembershipSnapshot = { earnEveryBaht: number; pointsPerInterval: number; redemptionCapPercent: number };

function membershipSnapshot(value: unknown): MembershipSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Record<string, unknown>;
  const { earnEveryBaht, pointsPerInterval, redemptionCapPercent } = snapshot;
  if (typeof earnEveryBaht !== "number" || typeof pointsPerInterval !== "number" || typeof redemptionCapPercent !== "number") return null;
  return { earnEveryBaht, pointsPerInterval, redemptionCapPercent };
}

function formatMembershipSnapshot(value: unknown) {
  const snapshot = membershipSnapshot(value);
  if (!snapshot) return "ยังไม่เคยตั้งค่า";
  return `ซื้อทุก ${snapshot.earnEveryBaht.toLocaleString("th-TH")} บาท ได้ ${snapshot.pointsPerInterval.toLocaleString("th-TH")} แต้ม · จำกัดแลก ${snapshot.redemptionCapPercent}% ของบิล`;
}

export default async function MembersPage() {
  await connection();
  const user = await requireOrganizationPermission("organization.manage");
  const [org, settings, members, entries, settingsHistory] = await Promise.all([
    db.organization.findUnique({ where: { id: user.organizationId }, select: { name: true, branches: { take: 1, select: { name: true } } } }),
    db.membershipSettings.findUnique({ where: { organizationId: user.organizationId } }),
    db.customerMember.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true, name: true, phone: true, createdAt: true, isActive: true } }),
    db.loyaltyEntry.groupBy({ by: ["memberId"], where: { member: { organizationId: user.organizationId } }, _sum: { points: true } }),
    db.auditLog.findMany({ where: { organizationId: user.organizationId, action: "membership.settings_updated" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10, select: { id: true, before: true, after: true, createdAt: true, actor: { select: { displayName: true } } } }),
  ]);
  const balance = new Map(entries.map((entry) => [entry.memberId, entry._sum.points ?? 0]));
  return <AppShell branchName={org?.branches[0]?.name} organizationName={org?.name} userName={user.displayName}><main className="branch-page">
    <header className="dashboard-header"><div><p className="eyebrow">Back Office · Loyalty</p><h1>สมาชิกและสะสมแต้ม</h1><p className="page-description">สมัครสมาชิกจาก POS ด้วยเบอร์มือถือ และสะสมแต้มอัตโนมัติเมื่อชำระบิลครบ</p></div></header>
    <section className="branch-layout"><article className="branch-panel"><div className="panel-heading"><div><p className="eyebrow">สมาชิก</p><h2>{members.length} ราย</h2></div></div>
      {members.length ? <div className="branch-list">{members.map((member) => <article className="branch-item" key={member.id}><div><strong>{member.name}</strong><p>{member.phone} · สมัคร {member.createdAt.toLocaleDateString("th-TH")}</p></div><span>{balance.get(member.id) ?? 0} แต้ม</span></article>)}</div> : <p className="empty-state">สมาชิกจะปรากฏเมื่อผูกสมาชิกกับบิลจากหน้า Counter POS</p>}
    </article><aside className="branch-create-card"><p className="eyebrow">กติกาคะแนน</p><h2>ตั้งค่าการสะสม/แลก</h2><MembershipForm defaults={{ earnEveryBaht: Math.max(1, Math.round((settings?.pointsPerHundredSatang ?? 10_000) / 100)), pointsPerInterval: settings?.pointsPerHundredBaht ?? 1, redemptionCapPercent: settings?.redemptionCapPercent ?? 50 }} />
      <section className="membership-history"><h3>ประวัติการตั้งค่าแต้ม</h3>{settingsHistory.length ? <div className="membership-history-list">{settingsHistory.map((entry) => <article key={entry.id}><small>{new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(entry.createdAt)} · {entry.actor?.displayName ?? "ผู้ใช้ที่ไม่ทราบชื่อ"}</small><p><span>ก่อน:</span> {formatMembershipSnapshot(entry.before)}</p><p><span>หลัง:</span> {formatMembershipSnapshot(entry.after)}</p></article>)}</div> : <p className="membership-history-empty">ยังไม่มีประวัติการเปลี่ยนกติกาคะแนน</p>}</section>
    </aside></section>
  </main></AppShell>;
}
