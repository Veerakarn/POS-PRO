"use client";

import { useActionState, useEffect } from "react";

import {
  changeOwnPin,
  type ChangePinState,
} from "@/app/account/change-pin/actions";

const initialState: ChangePinState = {};

export function ChangePinForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [state, formAction, isPending] = useActionState(changeOwnPin, initialState);
  useEffect(() => { if (state.success) onSuccess?.(); }, [state.success, onSuccess]);

  return (
    <form action={formAction} className="access-form">
      {onSuccess ? <input type="hidden" name="presentation" value="drawer" /> : null}
      <label>
        <span>PIN ปัจจุบัน</span>
        <input autoComplete="current-password" inputMode="numeric" maxLength={6} name="currentPin" pattern="[0-9]{6}" required type="password" />
      </label>
      <label>
        <span>PIN ใหม่ 6 หลัก</span>
        <input autoComplete="new-password" inputMode="numeric" maxLength={6} name="newPin" pattern="[0-9]{6}" required type="password" />
      </label>
      <label>
        <span>ยืนยัน PIN ใหม่</span>
        <input autoComplete="new-password" inputMode="numeric" maxLength={6} name="pinConfirmation" pattern="[0-9]{6}" required type="password" />
      </label>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button className="primary-button" disabled={isPending} type="submit">
        {isPending ? "กำลังบันทึก…" : "บันทึก PIN ใหม่"}
      </button>
    </form>
  );
}
