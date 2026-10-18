"use client";

import { useActionState } from "react";

import { createBranch, type BranchState } from "@/app/settings/branches/actions";

const initialState: BranchState = {};

export function BranchForm() {
  const [state, formAction, isPending] = useActionState(createBranch, initialState);

  return (
    <form action={formAction} className="branch-form">
      <label>
        <span>ชื่อสาขา</span>
        <input name="name" placeholder="เช่น สาขาอโศก" required />
      </label>
      <label>
        <span>รหัสสาขา</span>
        <input autoCapitalize="characters" name="code" pattern="[A-Z0-9_\x2d]{2,12}" placeholder="ASK01" required />
        <small>ใช้ภาษาอังกฤษ ตัวเลข _ หรือ - เช่น ASK01</small>
      </label>
      <div className="form-grid">
        <label>
          <span>เขตเวลา</span>
          <select defaultValue="Asia/Bangkok" name="timezone">
            <option value="Asia/Bangkok">Asia/Bangkok</option>
            <option value="Asia/Jakarta">Asia/Jakarta</option>
            <option value="Asia/Singapore">Asia/Singapore</option>
          </select>
        </label>
        <label>
          <span>สกุลเงิน</span>
          <select defaultValue="THB" name="currency">
            <option value="THB">THB · บาท</option>
            <option value="IDR">IDR · รูเปียห์</option>
            <option value="SGD">SGD · ดอลลาร์สิงคโปร์</option>
          </select>
        </label>
      </div>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="form-success" role="status">{state.success}</p> : null}
      <button className="primary-button" disabled={isPending} type="submit">
        {isPending ? "กำลังเพิ่มสาขา…" : "เพิ่มสาขา"}
      </button>
    </form>
  );
}
