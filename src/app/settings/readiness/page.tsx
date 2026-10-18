import Link from "next/link";
import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { requireOrganizationPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { isThaiTaxId } from "@/lib/commerce-rules";

function Check({ ready, title, detail, href }: { ready: boolean; title: string; detail: string; href: string }) {
  return <li className="readiness-check">
    <span className={ready ? "readiness-ok" : "readiness-attention"}>{ready ? "พร้อม" : "ตรวจสอบ"}</span>
    <div><strong>{title}</strong><p>{detail}</p></div>
    <Link href={href}>จัดการ →</Link>
  </li>;
}

export default async function ReadinessPage() {
  await connection();
  const user = await requireOrganizationPermission("organization.manage");
  const now = new Date();
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: user.organizationId },
    select: {
      name: true,
      _count: { select: { menuItems: { where: { isActive: true, category: { isActive: true } } } } },
      branches: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true, name: true,
          taxProfile: { select: { isVatRegistered: true, legalName: true, taxpayerId: true } },
          _count: { select: {
            tables: { where: { isActive: true } },
            stations: { where: { isActive: true } },
            paymentMethods: { where: { isActive: true } },
            printJobs: { where: { status: "FAILED" } },
          } },
          stations: { where: { isActive: true }, select: { id: true, name: true } },
          printRoutes: { where: { isActive: true, printer: { isActive: true, printAgent: { isActive: true } } }, select: { stationId: true, documentType: true } },
          printers: { where: { isActive: true }, select: { name: true, printAgent: { select: { isActive: true, lastSeenAt: true, lastError: true } } } },
        },
      },
    },
  });
  const unassignedMenus = await Promise.all(organization.branches.map((branch) => db.menuItem.count({
    where: { organizationId: user.organizationId, isActive: true, category: { isActive: true }, stationRoutes: { none: { station: { branchId: branch.id, isActive: true } } } },
  })));
  let publicUrl: string | null = null;
  try {
    const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
    if (url.protocol === "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && !url.username && !url.password) publicUrl = url.origin;
  } catch { /* Missing configuration is displayed below. */ }
  return <AppShell organizationName={organization.name} userName={user.displayName}>
    <main className="branch-page">
      <header className="dashboard-header"><div><p className="eyebrow">Operations</p><h1>ความพร้อมร้าน</h1><p className="page-description">ข้อมูล ณ {now.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} · โหลดหน้าใหม่เพื่ออัปเดตสถานะ</p></div><form action="/settings/readiness" method="get"><button className="secondary-button" type="submit">อัปเดตสถานะ</button></form></header>
      <section className="branch-panel readiness-panel">
        <h2>ระบบกลาง</h2>
        <ul className="readiness-list">
          <Check ready={true} title="ฐานข้อมูล" detail="อ่านข้อมูลร้านจากฐานข้อมูลสำเร็จ" href="/dashboard" />
          <Check ready={!!publicUrl} title="ที่อยู่เว็บสำหรับ QR" detail={publicUrl ? `ตั้งค่า ${publicUrl} แล้ว — ควรลองสแกนผ่านเน็ตมือถือเพื่อยืนยันว่าเข้าถึงได้` : "ยังไม่ได้ตั้งค่า NEXT_PUBLIC_APP_URL เป็น HTTPS สำหรับลูกค้านอกร้าน"} href="/settings/tables" />
          <Check ready={organization._count.menuItems > 0} title="เมนูที่เปิดขาย" detail={`${organization._count.menuItems} รายการในหมวดหมู่ที่เปิดใช้งาน`} href="/settings/menu" />
        </ul>
      </section>
      {organization.branches.map((branch, index) => {
        const suffix = `?branch=${encodeURIComponent(branch.id)}`;
        const offline = branch.printers.filter((printer) => !printer.printAgent?.isActive || !printer.printAgent.lastSeenAt || now.getTime() - printer.printAgent.lastSeenAt.getTime() > 90_000 || printer.printAgent.lastError);
        const missingStations = branch.stations.filter((station) => !branch.printRoutes.some((route) => route.documentType === "ORDER_TICKET" && route.stationId === station.id));
        const receipt = branch.printRoutes.some((route) => route.documentType === "RECEIPT");
        const tableQr = branch.printRoutes.some((route) => route.documentType === "TABLE_QR");
        return <section className="branch-panel readiness-panel" key={branch.id}>
          <h2>{branch.name}</h2>
          <ul className="readiness-list">
            <Check ready={branch._count.tables > 0} title="โต๊ะและ QR" detail={`${branch._count.tables} โต๊ะที่เปิดใช้งาน`} href={`/settings/tables${suffix}`} />
            <Check ready={branch._count.stations > 0 && unassignedMenus[index] === 0} title="เมนูส่งถึงจุดผลิต" detail={`${branch._count.stations} จุดผลิต · ${unassignedMenus[index]} เมนูยังไม่มีจุดผลิตของสาขานี้`} href={`/settings/stations${suffix}`} />
            <Check ready={branch._count.paymentMethods > 0} title="ช่องทางรับเงิน" detail={`${branch._count.paymentMethods} ช่องทางที่พนักงานเลือกบันทึกรับชำระได้`} href={`/shifts${suffix}`} />
            <Check ready={!!branch.taxProfile && isThaiTaxId(branch.taxProfile.taxpayerId)} title="ข้อมูลภาษีร้าน" detail={branch.taxProfile ? `${branch.taxProfile.legalName} · ${isThaiTaxId(branch.taxProfile.taxpayerId) ? (branch.taxProfile.isVatRegistered ? "จดทะเบียน VAT" : "ยังไม่ระบุจดทะเบียน VAT") : "บันทึกข้อมูลชั่วคราวแล้ว รอแก้เลขผู้เสียภาษีก่อนออกใบกำกับภาษี"}` : "ยังไม่ได้บันทึกชื่อ ที่อยู่ และเลขผู้เสียภาษีของสาขา"} href="/settings/tax" />
            <Check ready={branch.printers.length > 0 && offline.length === 0} title="การเชื่อมต่อเครื่องพิมพ์" detail={offline.length ? `Agent ไม่ติดต่อภายใน 90 วินาทีหรือมีข้อผิดพลาด: ${offline.map((printer) => printer.name).join(", ")}` : `${branch.printers.length} เครื่อง · สถานะ Agent ไม่ใช่การยืนยันว่ามีกระดาษหรือพิมพ์สำเร็จ`} href={`/settings/printers${suffix}`} />
            <Check ready={tableQr} title="QR พิมพ์เมื่อเปิดโต๊ะ" detail={tableQr ? "มีเส้นทาง QR ไปยังเครื่องพิมพ์แล้ว · ลองเปิดโต๊ะเพื่อยืนยันการพิมพ์จริง" : "ยังไม่ได้กำหนดเส้นทาง QR ไปยังเครื่องพิมพ์ความร้อน"} href={`/settings/printers${suffix}`} />
            <Check ready={receipt && branch.stations.length > 0 && missingStations.length === 0} title="เส้นทางใบเสร็จและใบครัว" detail={`${receipt ? "มี" : "ยังไม่มี"}เส้นทางใบเสร็จ · ${missingStations.length} จุดผลิตยังไม่มีเครื่องพิมพ์ที่ผูกกับ Agent`} href={`/settings/printers${suffix}`} />
            <Check ready={branch._count.printJobs === 0} title="งานพิมพ์ผิดพลาด" detail={`${branch._count.printJobs} งานที่ต้องตรวจสอบ`} href={`/settings/printers${suffix}`} />
          </ul>
        </section>;
      })}
      {!organization.branches.length ? <p className="empty-state">ยังไม่มีสาขา <Link href="/settings/branches">เพิ่มสาขา</Link></p> : null}
      <aside className="printer-install-note">ก่อนเปิดขายจริง ให้ลองสั่งจากมือถือ รับชำระ และพิมพ์ใบเสร็จอย่างน้อยหนึ่งรอบ รวมถึงตรวจแผนสำรองข้อมูลใน Neon</aside>
    </main>
  </AppShell>;
}
