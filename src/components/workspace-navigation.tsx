"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

const desktopNavigationQuery = "(min-width: 1280px) and (pointer: fine)";
const desktopSnapshot = () => window.matchMedia(desktopNavigationQuery).matches;
const serverDesktopSnapshot = () => false;

const NavigationContext = createContext<{ open: boolean; pinned: boolean; setOpen: (open: boolean) => void } | null>(null);

export function useWorkspaceNavigation() {
  const context = useContext(NavigationContext);
  if (!context) throw new Error("Workspace navigation requires its provider");
  return context;
}

export function WorkspaceNavigation({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const subscribe = useCallback((notify: () => void) => {
    const media = window.matchMedia(desktopNavigationQuery);
    const update = () => { setMenuOpen(false); notify(); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const desktop = useSyncExternalStore(subscribe, desktopSnapshot, serverDesktopSnapshot);
  const open = desktop || menuOpen;
  const setOpen = (value: boolean) => setMenuOpen(desktop ? false : value);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || desktop) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") { setMenuOpen(false); frame.current?.querySelector<HTMLButtonElement>(".workspace-menu-toggle")?.focus(); }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, desktop]);
  useEffect(() => {
    const root = frame.current;
    if (!open || !root) return;
    const content = root.querySelector<HTMLElement>(".app-shell-content");
    if (!content) return;
    const media = window.matchMedia("(max-width: 1000px)");
    const previousOverflow = document.body.style.overflow;
    function updateOverlay() {
      if (!content) return;
      content.inert = media.matches;
      document.body.style.overflow = media.matches ? "hidden" : previousOverflow;
      if (media.matches) root?.querySelector<HTMLButtonElement>(".sidebar-toggle")?.focus();
    }
    updateOverlay();
    media.addEventListener("change", updateOverlay);
    return () => {
      content.inert = false;
      document.body.style.overflow = previousOverflow;
      media.removeEventListener("change", updateOverlay);
      if (media.matches) root?.querySelector<HTMLButtonElement>(".workspace-menu-toggle")?.focus();
    };
  }, [open]);
  return <NavigationContext.Provider value={{ open, pinned: desktop, setOpen }}><div ref={frame} className={`app-shell workspace-shell${open ? " navigation-open" : ""}`}>
    {children}
    <button className="workspace-menu-backdrop" aria-label="ปิดเมนูด้านข้าง" type="button" tabIndex={-1} onClick={() => { setOpen(false); frame.current?.querySelector<HTMLButtonElement>(".workspace-menu-toggle")?.focus(); }} />
  </div></NavigationContext.Provider>;
}

export function WorkspaceHeaderBrand({ organizationName, branchName }: { organizationName: string; branchName: string }) {
  const { open, pinned, setOpen } = useWorkspaceNavigation();
  return <div className="workspace-header-brand">
    {!pinned ? <button className="workspace-menu-toggle" aria-controls="app-sidebar-nav" aria-expanded={open} aria-label={open ? "ปิดเมนูหลัก" : "เปิดเมนูหลัก"} onClick={() => setOpen(!open)} type="button"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg><span>เมนู</span></button> : null}
    <div><strong>{organizationName}</strong><small>{branchName}</small></div>
  </div>;
}
