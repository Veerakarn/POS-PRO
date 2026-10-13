"use client";

import { useActionState } from "react";
import { createPromoCode, saveMembershipSettings, saveTaxProfile, type CommerceState } from "@/app/settings/commerce/actions";

function Feedback({ state }: { state: CommerceState }) {
  return state.error ? <p className="form-error" role="alert">{state.error}</p> : state.success ? <p className="form-success" role="status">{state.success}</p> : null;
}

export function PromoForm() {
  const [state, action, pending] = useActionState(createPromoCode, {});
  return <form action={action} className="stacked-form">
    <label><span>รหัสโปรโมชั่น</span><input name="code" maxLength={24} pattern="[A-Za-z0-9_-]{3,24}" required placeholder="เช่น LUNCH10" /></label>
    <label><span>ชื่อโปรโมชั่น</span><input name="name" maxLength={80} required /></label>
    <label><span>รูปแบบส่วนลด</span><select name="kind"><option value="PERCENT">เปอร์เซ็นต์</option><option value="FIXED">จำนวนเงิน (บาท)</option></select></label>
    <label><span>ส่วนลด (% หรือ บาท)</span><input name="value" type="number" min="0.01" step="0.01" required /></label>
    <label><span>ยอดขั้นต่ำ (บาท)</span><input name="minimum" type="number" min="0" step="0.01" defaultValue="0" required /></label>
    <label><span>ลดสูงสุด (บาท, ไม่บังคับ)</span><input name="maximumDiscount" type="number" min="0.01" step="0.01" /></label>
    <label><span>จำกัดจำนวนครั้ง (ไม่บังคับ)</span><input name="usageLimit" type="number" min="1" step="1" /></label>
    <label><span>เริ่มใช้</span><input name="startsAt" type="date" /></label>
    <label><span>สิ้นสุด</span><input name="endsAt" type="date" /></label>
    <Feedback state={state} /><button className="primary-button" disabled={pending}>{pending ? "กำลังบันทึก…" : "สร้างโปรโมชั่น"}</button>
  </form>;
}

export function MembershipForm({ defaults }: { defaults: { earnEveryBaht: number; pointsPerInterval: number; redemptionCapPercent: number } }) {
  const [state, action, pending] = useActionState(saveMembershipSettings, {});
  return <form action={action} className="stacked-form">
    <label><span>ทุกยอดซื้อ (บาท)</span><input name="earnEveryBaht" type="number" min="1" max="100000" defaultValue={defaults.earnEveryBaht} required /></label>
    <label><span>ได้รับกี่แต้ม</span><input name="pointsPerInterval" type="number" min="1" max="100000" defaultValue={defaults.pointsPerInterval} required /></label>
    <p className="page-description">มูลค่าแลกแต้มกำหนดไว้ 100 แต้ม = 1 บาท</p>
    <label><span>ใช้แต้มลดได้ไม่เกิน (% ของบิล)</span><input name="redemptionCapPercent" type="number" min="1" max="100" defaultValue={defaults.redemptionCapPercent} required /></label>
    <Feedback state={state} /><button className="primary-button" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกกติกาสมาชิก"}</button>
  </form>;
}

export function TaxProfileForm({ branchId, defaults }: { branchId: string; defaults?: { legalName: string; taxpayerId: string; address: string; branchNumber: string; isVatRegistered: boolean; vatRatePercent: number; taxIncluded: boolean; documentPrefix: string } }) {
  const [state, action, pending] = useActionState(saveTaxProfile, {});
  return <form action={action} className="stacked-form">
    <input name="branchId" type="hidden" value={branchId} />
    <label><span>ชื่อผู้ประกอบการ/ร้าน</span><input name="legalName" defaultValue={defaults?.legalName} maxLength={200} required /></label>
    <label><span>เลขประจำตัวผู้เสียภาษี 13 หลัก</span><input name="taxpayerId" defaultValue={defaults?.taxpayerId} inputMode="numeric" maxLength={13} required /></label>
    <label><span>ที่อยู่ตามทะเบียน</span><textarea name="address" defaultValue={defaults?.address} maxLength={500} required rows={3} /></label>
    <label><span>รหัสสาขา (สำนักงานใหญ่ 00000)</span><input name="branchNumber" defaultValue={defaults?.branchNumber ?? "00000"} pattern="\d{5}" required /></label>
    <label><span>คำนำหน้าเลขที่เอกสาร</span><input name="documentPrefix" defaultValue={defaults?.documentPrefix ?? "TAX"} maxLength={10} pattern="[A-Za-z0-9-]+" required /></label>
    <label><span>อัตรา VAT (%)</span><input name="vatRate" defaultValue={defaults?.vatRatePercent ?? 7} type="number" min="0" max="20" step="0.01" required /></label>
    <label className="checkbox-row"><input name="isVatRegistered" type="checkbox" defaultChecked={defaults?.isVatRegistered} /><span>สาขานี้จดทะเบียนภาษีมูลค่าเพิ่ม (VAT)</span></label>
    <label className="checkbox-row"><input name="taxIncluded" type="checkbox" defaultChecked={defaults?.taxIncluded ?? true} /><span>ราคาที่ตั้งไว้รวม VAT แล้ว</span></label>
    <p className="page-description">อัตราและวิธีคิดภาษีจะบันทึกลงบิลใหม่เท่านั้น การแก้ข้อมูลนี้ไม่เปลี่ยนบิลเก่า</p>
    <Feedback state={state} /><button className="primary-button" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกข้อมูลภาษี"}</button>
  </form>;
}
