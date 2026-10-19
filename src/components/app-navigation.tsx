"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkspaceNavigation } from "@/components/workspace-navigation";

type NavigationItem = {
  href: string;
  label: string;
  group: string;
};

export function AppNavigation({
  homeHref,
  items,
  organizationName,
}: {
  homeHref: string;
  items: NavigationItem[];
  organizationName: string;
}) {
  const pathname = usePathname();
  const { open: isOpen, setOpen: setIsOpen } = useWorkspaceNavigation();
  const groups = [...new Set(items.map((item) => item.group))];

  return (
    <aside className={`app-sidebar${isOpen ? " is-open" : ""}`}>
      <div className="sidebar-heading">
        <Link className="brand" href={homeHref} onClick={() => setIsOpen(false)}>
          <span className="brand-mark">P</span>
          <span className="brand-copy"><strong>{organizationName}</strong><small>POS WORKSPACE</small></span>
        </Link>
        <button
          aria-controls="app-sidebar-nav"
          aria-expanded={isOpen}
          aria-label={isOpen ? "ปิดเมนู" : "เปิดเมนู"}
          className="sidebar-toggle"
          onClick={() => setIsOpen(!isOpen)}
          type="button"
        >
          <span aria-hidden="true">☰</span> เมนู
        </button>
      </div>
      <nav aria-label="เมนูหลัก" className="sidebar-nav" id="app-sidebar-nav">
        {groups.map((group) => (
          <div className="sidebar-group" key={group}>
            <p className="sidebar-group-label">{group}</p>
            {items.filter((item) => item.group === group).map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={active ? "sidebar-link active" : "sidebar-link"}
                  href={item.href}
                  key={item.href}
                  onClick={() => setIsOpen(false)}
                  prefetch={false}
                >
                  <span aria-hidden="true" className="sidebar-link-mark" />
                  <span>{item.label}</span>
                  <span aria-hidden="true" className="sidebar-chevron">›</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="sidebar-footer-mark">P</span>
        <span><strong>POS@PRO</strong><small>เครื่องมือจัดการร้านอาหาร</small></span>
      </div>
    </aside>
  );
}
