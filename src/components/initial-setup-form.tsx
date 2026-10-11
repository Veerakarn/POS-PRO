"use client";

import { useActionState } from "react";

import { createInitialOrganization, type SetupState } from "@/app/setup/actions";

const initialState: SetupState = {};

export function InitialSetupForm({ requiresSetupToken }: { requiresSetupToken: boolean }) {
  const [state, formAction, isPending] = useActionState(createInitialOrganization, initialState);

  return (
    <form action={formAction} className="setup-form">
      <section>
        <p className="eyebrow">ข้อมูลร้าน</p>
        <div className="form-grid">
          <label>
            <span>ชื่อร้านหรือองค์กร</span>
            <input autoComplete="organization" name="organizationName" placeholder="เช่น อร่อยดี กรุ๊ป" required />
          </label>
          <label>
            <span>รหัสองค์กร</span>
            <input autoCapitalize="none" name="organizationSlug" pattern="[a-z0-9-]+" placeholder="aroi-dee" required />
            <small>ใช้กับ URL และการแยกข้อมูลระหว่างร้าน</small>
          </label>
        </div>
      </section>
      <section>
        <p className="eyebrow">สาขาแรก</p>
        <div className="form-grid">
          <label>
            <span>ชื่อสาขา</span>
            <input name="branchName" placeholder="เช่น รัชดา" required />
          </label>
          <label>
            <span>รหัสสาขา</span>
            <input autoCapitalize="characters" name="branchCode" placeholder="RCD01" required />
          </label>
        </div>
      </section>
      <section>
        <p className="eyebrow">เจ้าของระบบ</p>
        <div className="form-grid">
          <label>
            <span>ชื่อสำหรับแสดงผล</span>
            <input autoComplete="name" name="ownerName" placeholder="ชื่อผู้ดูแลร้าน" required />
          </label>
          <label>
            <span>อีเมล</span>
            <input autoComplete="email" name="ownerEmail" placeholder="owner@example.com" type="email" required />
            <small>ใช้เข้าสู่ระบบสำหรับเจ้าของร้าน</small>
          </label>
        </div>
        <div className="form-grid">
          <label>
            <span>PIN เจ้าของ 6 หลัก</span>
            <input autoComplete="new-password" inputMode="numeric" maxLength={6} name="ownerPin" pattern="[0-9]{6}" required type="password" />
          </label>
          <label>
            <span>ยืนยัน PIN</span>
            <input autoComplete="new-password" inputMode="numeric" maxLength={6} name="ownerPinConfirmation" pattern="[0-9]{6}" required type="password" />
          </label>
        </div>
      </section>
      {requiresSetupToken ? (
        <label>
          <span>รหัสตั้งค่าครั้งแรก</span>
          <input autoComplete="off" name="setupToken" required type="password" />
        </label>
      ) : null}
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button className="primary-button setup-submit" disabled={isPending} type="submit">
        {isPending ? "กำลังสร้างระบบ…" : "สร้างร้านและสาขาแรก"}
      </button>
    </form>
  );
}
