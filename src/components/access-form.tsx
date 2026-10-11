"use client";

import { useActionState } from "react";

import {
  claimOwnerAccess,
  login,
  type AccessState,
} from "@/app/auth-actions";

const initialState: AccessState = {};

type AccessFormProps = {
  mode: "claim" | "login";
  requiresSetupToken?: boolean;
};

export function AccessForm({ mode, requiresSetupToken = false }: AccessFormProps) {
  const action = mode === "claim" ? claimOwnerAccess : login;
  const [state, formAction, isPending] = useActionState(action, initialState);
  const isClaim = mode === "claim";

  return (
    <form action={formAction} className="access-form">
      <label>
        <span>อีเมล</span>
        <input autoComplete="email" name="email" placeholder="owner@example.com" required type="email" />
      </label>
      <label>
        <span>PIN 6 หลัก</span>
        <input autoComplete={isClaim ? "new-password" : "current-password"} inputMode="numeric" maxLength={6} name="pin" pattern="[0-9]{6}" required type="password" />
      </label>
      {isClaim ? (
        <label>
          <span>ยืนยัน PIN</span>
          <input autoComplete="new-password" inputMode="numeric" maxLength={6} name="pinConfirmation" pattern="[0-9]{6}" required type="password" />
        </label>
      ) : null}
      {requiresSetupToken ? (
        <label>
          <span>รหัสตั้งค่าครั้งแรก</span>
          <input autoComplete="off" name="setupToken" required type="password" />
        </label>
      ) : null}
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button className="primary-button" disabled={isPending} type="submit">
        {isPending ? "กำลังตรวจสอบ…" : isClaim ? "เปิดใช้บัญชีเจ้าของ" : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}
