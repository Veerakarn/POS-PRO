import Link from "next/link";
import type { ReactNode } from "react";

import { logout } from "@/app/auth-actions";
import { AppNavigation } from "@/components/app-navigation";
import { defaultLandingRoute, getCurrentUser } from "@/lib/auth";
import { userHasPermission } from "@/lib/authorization";

const navigation = [
  { href: "/dashboard", label: "ภาพรวมร้าน", permission: "report.view", group: "ภาพรวม" },
  { href: "/reports", label: "รายงาน", permission: "report.view", group: "ภาพรวม" },
  { href: "/audit", label: "ประวัติระบบ", permission: "report.view", group: "ภาพรวม" },
  { href: "/pos", label: "Counter POS", permission: "pos.use", group: "หน้าร้าน" },
  { href: "/kitchen", label: "ครัวและบาร์", permission: "kitchen.view", group: "หน้าร้าน" },
  { href: "/requests", label: "คำขอจากโต๊ะ", permission: "service.manage", group: "หน้าร้าน" },
  { href: "/shifts", label: "กะ / การชำระ", permission: "payment.manage", group: "หน้าร้าน" },
  { href: "/sales", label: "การขาย / คืนเงิน", permission: "payment.manage", group: "หน้าร้าน" },
  { href: "/inventory", label: "วัตถุดิบ / ต้นทุน", permission: "inventory.manage", group: "จัดการร้าน" },
  { href: "/settings/tables", label: "โต๊ะและ QR", permission: "table.manage", group: "จัดการร้าน" },
  { href: "/settings/menu", label: "เมนู", permission: "menu.manage", group: "จัดการร้าน" },
  { href: "/settings/promotions", label: "โปรโมชั่น", permission: "organization.manage", group: "จัดการร้าน" },
  { href: "/settings/members", label: "สมาชิก / แต้ม", permission: "organization.manage", group: "จัดการร้าน" },
  { href: "/settings/tax", label: "ภาษี / ใบกำกับ", permission: "payment.manage", group: "จัดการร้าน" },
  { href: "/settings/stations", label: "จุดผลิต", permission: "menu.manage", group: "ตั้งค่า" },
  { href: "/settings/printers", label: "เครื่องพิมพ์", permission: "printer.manage", group: "ตั้งค่า" },
  { href: "/settings/branches", label: "จัดการสาขา", permission: "branch.manage", group: "ตั้งค่า" },
  { href: "/settings/staff", label: "พนักงาน / สิทธิ์", permission: "user.manage", group: "ตั้งค่า" },
  { href: "/settings/readiness", label: "ความพร้อมร้าน", permission: "organization.manage", group: "ตั้งค่า" },
];

export async function AppShell({
  children,
  branchName = "ยังไม่ได้เลือกสาขา",
  organizationName = "POS@PRO",
  userName,
}: {
  children: ReactNode;
  branchName?: string;
  organizationName?: string;
  userName?: string;
}) {
  const currentUser = await getCurrentUser();
  const allowedNavigation = currentUser
    ? navigation.filter((item) =>
        userHasPermission(currentUser.roleAssignments, item.permission),
      )
    : [];
  const resolvedUserName = currentUser?.displayName ?? userName;

  return (
    <div className="app-shell">
      <AppNavigation homeHref={currentUser ? defaultLandingRoute(currentUser) : "/"} items={allowedNavigation} organizationName={organizationName} />
      <div className="app-shell-content">
        <header className="topbar">
          <div className="topbar-context">
            <span>พื้นที่ทำงาน</span>
            <strong><span aria-hidden="true" className="topbar-status-dot" />สาขา {branchName}</strong>
          </div>
          {resolvedUserName ? (
            <Link className="user-chip" href="/account/change-pin" title="เปลี่ยน PIN">
              <span aria-hidden="true" className="user-avatar">{resolvedUserName.slice(0, 1)}</span>
              <span>{resolvedUserName}</span>
            </Link>
          ) : null}
          {currentUser ? (
            <form action={logout}>
              <button className="topbar-logout" type="submit">ออกจากระบบ</button>
            </form>
          ) : null}
        </header>
        {children}
      </div>
    </div>
  );
}
