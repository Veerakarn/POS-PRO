"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { logout } from "@/app/auth-actions";
import { updateOwnProfile, type ProfileState } from "@/app/account/profile-actions";
import { ChangePinForm } from "@/components/change-pin-form";

type Account = { displayName: string; email: string; avatarData?: string | null };
type Notification = { id: string; title: string; detail: string; createdAt: string };
type Panel = "account" | "profile" | "pin" | "notifications";

function Icon({ name }: { name: "bell" | "user" | "lock" | "logout" | "close" | "chevron" }) {
  const paths = {
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2" /></>,
    logout: <><path d="M10 4H4v16h6m5-12 4 4-4 4m-6-4h10" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    chevron: <path d="m8 10 4 4 4-4" />,
  };
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function Avatar({ name, src, large = false }: { name: string; src?: string | null; large?: boolean }) {
  return <span className={`account-avatar${large ? " large" : ""}`}>
    {/* Uploaded avatars are already resized and re-encoded by the server. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {src ? <img src={src} alt="" /> : name.slice(0, 1)}
  </span>;
}

function ProfileEditor({ account }: { account: Account }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateOwnProfile, {});
  const [preview, setPreview] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  const [fileError, setFileError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  return <form action={action} className="account-profile-form">
    <fieldset disabled={pending}>
      <div className="account-photo-editor">
        <Avatar large name={account.displayName} src={remove ? null : preview ?? account.avatarData} />
        <div><label className="secondary-button account-upload" htmlFor="account-avatar-file">เลือกรูปโปรไฟล์</label>
          <small>JPG, PNG หรือ WebP · ไม่เกิน 750 KB</small>
          <button type="button" className="link-button" onClick={() => { setRemove(true); setPreview(null); setFileError(""); if (fileInput.current) fileInput.current.value = ""; }}>ลบรูปโปรไฟล์</button>
        </div>
      </div>
      <input ref={fileInput} className="account-file-input" id="account-avatar-file" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
        const file = event.target.files?.[0];
        setFileError("");
        if (!file) return;
        if (file.size > 750 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          setPreview(null); setFileError("กรุณาเลือกรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 750 KB"); event.target.value = ""; return;
        }
        setRemove(false); setPreview(URL.createObjectURL(file));
      }} />
      <input type="hidden" name="removeAvatar" value={remove ? "yes" : "no"} />
      <label className="account-field">ชื่อที่แสดง<input name="displayName" defaultValue={account.displayName} maxLength={80} required autoComplete="name" /></label>
      <label className="account-field">อีเมล<input value={account.email} readOnly type="email" /><small>อีเมลสำหรับเข้าสู่ระบบ</small></label>
    </fieldset>
    {fileError || state.error ? <p className="form-error" role="alert">{fileError || state.error}</p> : null}
    {state.success ? <p className="account-success" role="status">{state.success}</p> : null}
    <button type="submit" className="primary-button" disabled={pending || !!fileError}>{pending ? "กำลังบันทึก…" : "บันทึกโปรไฟล์"}</button>
  </form>;
}

export function AccountMenu({ account }: { account: Account }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [pinChanged, setPinChanged] = useState(false);
  const [notifications, setNotifications] = useState<{ count: number; items: Notification[] } | null>(null);
  const [notificationError, setNotificationError] = useState(false);
  const [reload, setReload] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!panel || !dialog.current) return;
    const element = dialog.current;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = overflow; trigger.current?.focus(); };
  }, [panel]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function refresh() {
      if (document.hidden) return;
      try {
        const response = await fetch("/api/account/notifications", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("fetch");
        const data = await response.json();
        if (active) { setNotifications(data); setNotificationError(false); }
      } catch { if (active && !controller.signal.aborted) setNotificationError(true); }
    }
    void refresh();
    const interval = setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; controller.abort(); clearInterval(interval); document.removeEventListener("visibilitychange", refresh); };
  }, [reload]);
  const title = panel === "profile" ? "แก้ไขโปรไฟล์" : panel === "pin" ? "เปลี่ยน PIN" : panel === "notifications" ? "การแจ้งเตือน" : "บัญชีของฉัน";
  return <div className="account-controls">
    <button className="account-bell" type="button" aria-label={`การแจ้งเตือน${notifications?.count ? ` ${notifications.count} รายการรอรับเรื่อง` : ""}`} aria-haspopup="dialog" onClick={(event) => { trigger.current = event.currentTarget; setPanel("notifications"); setReload((value) => value + 1); }}>
      <Icon name="bell" />{notifications && notifications.count > 0 ? <span className="account-badge">{notifications.count > 9 ? "9+" : notifications.count}</span> : null}
    </button>
    <span className="account-control-divider" />
    <button className="user-chip account-trigger" type="button" aria-haspopup="dialog" aria-expanded={panel !== null && panel !== "notifications"} onClick={(event) => { trigger.current = event.currentTarget; setPanel("account"); }}>
      <Avatar name={account.displayName} src={account.avatarData} /><span className="account-trigger-name">{account.displayName}</span><Icon name="chevron" />
    </button>
    {panel ? createPortal(<dialog ref={dialog} className="account-drawer" aria-labelledby="account-drawer-title" onCancel={() => setPanel(null)} onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setPanel(null); } }}>
      <header className="account-drawer-header"><div><p>POS@PRO</p><h2 id="account-drawer-title">{title}</h2></div><button autoFocus type="button" className="account-icon-button" aria-label="ปิดแผง" onClick={() => setPanel(null)}><Icon name="close" /></button></header>
      <div className="account-drawer-body">
        {panel !== "account" && panel !== "notifications" ? <button className="account-back" type="button" onClick={() => setPanel("account")}>← กลับไปบัญชีของฉัน</button> : null}
        {panel === "account" ? <>
          {pinChanged ? <p className="account-success" role="status">เปลี่ยน PIN เรียบร้อยแล้ว</p> : null}
          <div className="account-summary"><Avatar large name={account.displayName} src={account.avatarData} /><h3>{account.displayName}</h3><p>{account.email}</p><span>บัญชีผู้ใช้งาน</span></div>
          <div className="account-menu-list"><button type="button" onClick={() => setPanel("profile")}><Icon name="user" /><span><strong>แก้ไขโปรไฟล์</strong><small>จัดการชื่อและรูปโปรไฟล์</small></span><span aria-hidden="true">›</span></button>
            <button type="button" onClick={() => setPanel("pin")}><Icon name="lock" /><span><strong>เปลี่ยน PIN</strong><small>อัปเดต PIN เพื่อความปลอดภัย</small></span><span aria-hidden="true">›</span></button></div>
          <form action={logout} className="account-logout-form"><button type="submit"><Icon name="logout" />ออกจากระบบ</button></form>
        </> : null}
        {panel === "profile" ? <ProfileEditor account={account} /> : null}
        {panel === "pin" ? <><p className="account-hint">ใช้ PIN ตัวเลข 6 หลัก เมื่อบันทึกแล้วระบบจะออกจากบัญชีบนอุปกรณ์อื่น</p><ChangePinForm onSuccess={() => { setPinChanged(true); setPanel("account"); }} /></> : null}
        {panel === "notifications" ? <>
          <div className="account-notification-heading"><span>คำขอจากโต๊ะที่รอรับเรื่อง</span><button className="link-button" type="button" onClick={() => setReload((value) => value + 1)}>รีเฟรช</button></div>
          {notificationError ? <p className="form-error" role="alert">โหลดการแจ้งเตือนไม่สำเร็จ กรุณากดรีเฟรช</p> : null}
          {!notifications && !notificationError ? <p role="status" className="account-hint">กำลังโหลดการแจ้งเตือน…</p> : null}
          {notifications?.count === 0 && !notificationError ? <div className="account-empty"><Icon name="bell" /><h3>ยังไม่มีแจ้งเตือนใหม่</h3><p>เมื่อมีคำขอจากโต๊ะ จะแสดงที่นี่</p></div> : null}
          <div className="account-notifications">{notifications?.items.map((item) => <Link key={item.id} href="/requests" onClick={() => setPanel(null)}><span className="account-notification-dot" /><div><strong>{item.title}</strong><p>{item.detail}</p><small>{new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", timeZone: "Asia/Bangkok" }).format(new Date(item.createdAt))}</small></div><span aria-hidden="true">›</span></Link>)}</div>
          {notifications && notifications.count > 20 ? <Link className="secondary-button" href="/requests" onClick={() => setPanel(null)}>ดูคำขอทั้งหมด ({notifications.count})</Link> : null}
        </> : null}
      </div>
    </dialog>, document.body) : null}
  </div>;
}
