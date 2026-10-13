import Link from "next/link";
import type { ReactNode } from "react";

import { logout } from "@/app/auth-actions";
import { defaultLandingRoute, getCurrentUser } from "@/lib/auth";
import { userHasPermission } from "@/lib/authorization";

const navigation = [
  { href: "/dashboard", label: "ภาพรวมร้าน", permission: "report.view" },
  { href: "/reports", label: "รายงาน", permission: "report.view" },
  { href: "/audit", label: "ประวัติระบบ", permission: "report.view" },
  { href: "/pos", label: "Counter POS", permission: "pos.use" },
  { href: "/kitchen", label: "ครัวและบาร์", permission: "kitchen.view" },
  { href: "/requests", label: "คำขอจากโต๊ะ", permission: "service.manage" },
  { href: "/shifts", label: "กะ / การชำระ", permission: "payment.manage" },
  { href: "/sales", label: "การขาย / คืนเงิน", permission: "payment.manage" },
  { href: "/inventory", label: "วัตถุดิบ / ต้นทุน", permission: "inventory.manage" },
  { href: "/settings/tables", label: "โต๊ะและ QR", permission: "table.manage" },
  { href: "/settings/menu", label: "เมนู", permission: "menu.manage" },
  { href: "/settings/promotions", label: "โปรโมชั่น", permission: "organization.manage" },
  { href: "/settings/members", label: "สมาชิก / แต้ม", permission: "organization.manage" },
  { href: "/settings/tax", label: "ภาษี / ใบกำกับ", permission: "payment.manage" },
  { href: "/settings/stations", label: "จุดผลิต", permission: "menu.manage" },
  { href: "/settings/printers", label: "เครื่องพิมพ์", permission: "printer.manage" },
  { href: "/settings/branches", label: "จัดการสาขา", permission: "branch.manage" },
  { href: "/settings/staff", label: "พนักงาน / สิทธิ์", permission: "user.manage" },
  { href: "/settings/readiness", label: "ความพร้อมร้าน", permission: "organization.manage" },
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
      <header className="topbar">
        <Link className="brand" href={currentUser ? defaultLandingRoute(currentUser) : "/"}>
          <span className="brand-mark">P</span>
          <span>{organizationName}</span>
        </Link>
        <nav aria-label="เมนูหลัก">
          {allowedNavigation.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        {resolvedUserName ? (
          <Link className="user-chip" href="/account/change-pin" title="เปลี่ยน PIN">
            {resolvedUserName}
          </Link>
        ) : null}
        {currentUser ? (
          <form action={logout}>
            <button className="topbar-logout" type="submit">ออกจากระบบ</button>
          </form>
        ) : null}
        <span className="branch-chip">สาขา · {branchName}</span>
      </header>
      {children}
    </div>
  );
}
