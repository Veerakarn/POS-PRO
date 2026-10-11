"use client";

import { useActionState } from "react";

import { closeCashShift, createPaymentMethod, openCashShift, togglePaymentMethod, type ShiftActionState } from "@/app/shifts/actions";

const initial: ShiftActionState = {};
type Shift = { id: string; status: string; openingCashSatang: number; expectedCashSatang: number | null; closingCashSatang: number | null; differenceSatang: number | null; note: string | null; openedAt: string; closedAt: string | null; userName: string };
type Method = { id: string; code: string; name: string; isCash: boolean; isActive: boolean };

function Feedback({ state }: { state: ShiftActionState }) { return <div aria-live="polite">{state.error ? <p className="form-error">{state.error}</p> : null}{state.success ? <p className="form-success">{state.success}</p> : null}</div>; }
function money(satang: number | null) { return satang === null ? "–" : new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(satang / 100); }
function time(value: string | null) { return value ? new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value)) : "–"; }

function OpenShiftForm({ branchId }: { branchId: string }) {
  const [state, action, pending] = useActionState(openCashShift, initial);
  return <form action={action} className="shift-form"><input name="branchId" type="hidden" value={branchId} /><label><span>เงินสดตั้งต้น (บาท)</span><input min="0" name="openingCash" placeholder="0.00" required step="0.01" type="number" /></label><label><span>หมายเหตุ</span><input maxLength={200} name="note" placeholder="เช่น รับลิ้นชักจากกะเช้า" /></label><Feedback state={state} /><button className="primary-button" disabled={pending} type="submit">{pending ? "กำลังเปิด…" : "เปิดกะเงินสด"}</button></form>;
}

function CloseShiftForm({ branchId, shiftId }: { branchId: string; shiftId: string }) {
  const [state, action, pending] = useActionState(closeCashShift, initial);
  return <form action={action} className="shift-form"><input name="branchId" type="hidden" value={branchId} /><input name="shiftId" type="hidden" value={shiftId} /><label><span>เงินสดที่นับได้ (บาท)</span><input min="0" name="closingCash" placeholder="0.00" required step="0.01" type="number" /></label><label><span>หมายเหตุปิดกะ</span><input maxLength={200} name="note" placeholder="ถ้ามี" /></label><Feedback state={state} /><button className="danger-button" disabled={pending} type="submit">{pending ? "กำลังปิด…" : "นับเงินและปิดกะ"}</button></form>;
}

function MethodForm({ branchId }: { branchId: string }) {
  const [state, action, pending] = useActionState(createPaymentMethod, initial);
  return <form action={action} className="shift-form method-create-form"><input name="branchId" type="hidden" value={branchId} /><label><span>ชื่อที่แสดง</span><input maxLength={60} name="name" placeholder="เช่น PromptPay บริษัท" required /></label><label><span>รหัส</span><input maxLength={30} name="code" pattern="[A-Za-z0-9_]+" placeholder="PROMPTPAY_COMPANY" required /></label><label className="shift-check"><input name="isCash" type="checkbox" /><span>นับเป็นเงินสดในลิ้นชัก</span></label><Feedback state={state} /><button className="secondary-button" disabled={pending} type="submit">{pending ? "กำลังเพิ่ม…" : "เพิ่มช่องทางชำระ"}</button></form>;
}

function MethodToggle({ branchId, method }: { branchId: string; method: Method }) {
  const [state, action, pending] = useActionState(togglePaymentMethod, initial);
  return <form action={action} className="method-toggle"><input name="branchId" type="hidden" value={branchId} /><input name="methodId" type="hidden" value={method.id} /><input name="isActive" type="hidden" value={String(!method.isActive)} /><button className={method.isActive ? "danger-button" : "secondary-button"} disabled={pending} type="submit">{pending ? "…" : method.isActive ? "ปิด" : "เปิด"}</button><Feedback state={state} /></form>;
}

export function ShiftManagement({ branchId, currentShift, methods, shifts }: { branchId: string; currentShift: Shift | null; methods: Method[]; shifts: Shift[] }) {
  return <div className="shift-management">
    <section className="shift-grid"><article className="shift-panel"><p className="eyebrow">Current shift</p><h2>{currentShift ? "กะของคุณกำลังเปิด" : "ยังไม่ได้เปิดกะ"}</h2>{currentShift ? <><div className="shift-current-metric"><span>เงินสดตั้งต้น</span><strong>{money(currentShift.openingCashSatang)}</strong><small>เปิดเมื่อ {time(currentShift.openedAt)}</small></div><CloseShiftForm branchId={branchId} shiftId={currentShift.id} /></> : <><p className="shift-copy">เปิดกะก่อนรับชำระเงินสด ระบบจะผูกยอดรับและคืนเงินเข้ากับกะของผู้ใช้งานคนนี้</p><OpenShiftForm branchId={branchId} /></>}</article><article className="shift-panel"><p className="eyebrow">Payment methods</p><h2>ช่องทางรับชำระ</h2><div className="method-list">{methods.map((method) => <div className={`method-row ${method.isActive ? "" : "inactive"}`} key={method.id}><div><strong>{method.name}</strong><small>{method.code}{method.isCash ? " · เงินสด" : ""}</small></div><MethodToggle branchId={branchId} method={method} /></div>)}</div><details className="method-details"><summary>เพิ่มช่องทางใหม่</summary><MethodForm branchId={branchId} /></details></article></section>
    <section className="shift-history"><div className="printer-section-heading"><div><p className="eyebrow">History</p><h2>ประวัติกะล่าสุด</h2></div></div><div className="printer-job-table-wrap"><table className="printer-job-table"><thead><tr><th>พนักงาน</th><th>เปิด</th><th>ปิด</th><th>ตั้งต้น</th><th>ยอดควรมี</th><th>ยอดนับจริง</th><th>ส่วนต่าง</th></tr></thead><tbody>{shifts.length ? shifts.map((shift) => <tr key={shift.id}><td>{shift.userName}</td><td>{time(shift.openedAt)}</td><td>{time(shift.closedAt)}</td><td>{money(shift.openingCashSatang)}</td><td>{money(shift.expectedCashSatang)}</td><td>{money(shift.closingCashSatang)}</td><td className={(shift.differenceSatang ?? 0) === 0 ? "shift-balanced" : "shift-difference"}>{money(shift.differenceSatang)}</td></tr>) : <tr><td className="empty-state" colSpan={7}>ยังไม่มีประวัติกะ</td></tr>}</tbody></table></div></section>
  </div>;
}
