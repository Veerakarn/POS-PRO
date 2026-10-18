"use client";

import { useActionState, useState } from "react";
import { createPromoCode, saveMembershipSettings, saveTaxProfile, type CommerceState } from "@/app/settings/commerce/actions";

function Feedback({ state }: { state: CommerceState }) {
  return state.error ? <p className="form-error" role="alert">{state.error}</p> : state.success ? <p className="form-success" role="status">{state.success}</p> : null;
}

export function PromoForm() {
  const [state, action, pending] = useActionState(createPromoCode, {});
  return <form action={action} className="stacked-form">
    <label><span>รหัสโปรโมชั่น</span><input name="code" maxLength={24} pattern="[A-Za-z0-9_\x2d]{3,24}" required placeholder="เช่น LUNCH10" /></label>
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
  const [values, setValues] = useState({
    legalName: defaults?.legalName ?? "",
    taxpayerId: defaults?.taxpayerId ?? "",
    address: defaults?.address ?? "",
    branchNumber: defaults?.branchNumber ?? "",
    documentPrefix: defaults?.documentPrefix ?? "",
    vatRate: defaults ? String(defaults.vatRatePercent) : "",
    isVatRegistered: defaults?.isVatRegistered ?? false,
    taxIncluded: defaults?.taxIncluded ?? true,
  });

  return <form action={action} className="stacked-form">
    <input name="branchId" type="hidden" value={branchId} />
    <label><span>ชื่อผู้ประกอบการ/ร้าน</span><input autoComplete="organization" name="legalName" onChange={(event) => setValues((current) => ({ ...current, legalName: event.target.value }))} value={values.legalName} maxLength={200} placeholder="ชื่อร้านตามเอกสารภาษี" required type="text" /><small>กรอกได้ทั้งตัวอักษรและตัวเลข</small></label>
    <label><span>เลขประจำตัวผู้เสียภาษี 13 หลัก</span><input name="taxpayerId" onChange={(event) => setValues((current) => ({ ...current, taxpayerId: event.target.value.replace(/\D/g, "").slice(0, 13) }))} value={values.taxpayerId} type="text" inputMode="numeric" minLength={13} maxLength={13} pattern="[0-9]{13}" placeholder="กรอกตัวเลข 13 หลัก" required title="กรอกเฉพาะตัวเลขให้ครบ 13 หลัก" /><small>บันทึกเลขสมมติ 13 หลักเพื่อทดสอบได้ แก้เป็นเลขจริงก่อนออกใบกำกับภาษี</small></label>
    <label><span>ที่อยู่ตามทะเบียน</span><textarea autoComplete="street-address" inputMode="text" name="address" onChange={(event) => setValues((current) => ({ ...current, address: event.target.value }))} value={values.address} maxLength={500} placeholder="ที่อยู่ตามเอกสารภาษี" required rows={3} /><small>กรอกได้ทั้งตัวอักษรและตัวเลข</small></label>
    <label><span>รหัสสาขา (สำนักงานใหญ่ 00000)</span><input autoComplete="off" inputMode="numeric" maxLength={5} name="branchNumber" onChange={(event) => setValues((current) => ({ ...current, branchNumber: event.target.value }))} value={values.branchNumber} pattern="[0-9]{5}" placeholder="00000" required title="กรอกรหัสสาขาเป็นตัวเลข 5 หลัก" type="text" /></label>
    <label><span>คำนำหน้าเลขที่เอกสาร</span><input name="documentPrefix" onChange={(event) => setValues((current) => ({ ...current, documentPrefix: event.target.value }))} value={values.documentPrefix} maxLength={10} pattern="[A-Za-z0-9\x2d]+" placeholder="TAX" required /></label>
    <label><span>อัตรา VAT (%)</span><input name="vatRate" onChange={(event) => setValues((current) => ({ ...current, vatRate: event.target.value }))} value={values.vatRate} type="number" min="0" max="20" step="0.01" placeholder="7" required /></label>
    <label className="checkbox-row"><input checked={values.isVatRegistered} name="isVatRegistered" onChange={(event) => setValues((current) => ({ ...current, isVatRegistered: event.target.checked }))} type="checkbox" /><span>สาขานี้จดทะเบียนภาษีมูลค่าเพิ่ม (VAT)</span></label>
    <label className="checkbox-row"><input checked={values.taxIncluded} name="taxIncluded" onChange={(event) => setValues((current) => ({ ...current, taxIncluded: event.target.checked }))} type="checkbox" /><span>ราคาที่ตั้งไว้รวม VAT แล้ว</span></label>
    <p className="page-description">อัตราและวิธีคิดภาษีจะบันทึกลงบิลใหม่เท่านั้น การแก้ข้อมูลนี้ไม่เปลี่ยนบิลเก่า</p>
    <Feedback state={state} /><button className="primary-button" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกข้อมูลภาษี"}</button>
  </form>;
}
