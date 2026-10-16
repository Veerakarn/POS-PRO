"use client";

import { useActionState, type FormEvent } from "react";

import { setRestaurantTableActive, type TableState } from "@/app/settings/tables/actions";

const initialState: TableState = {};

export function TableDeleteButton({ tableId, tableName, isActive }: { tableId: string; tableName: string; isActive: boolean }) {
  const [state, formAction, isPending] = useActionState(setRestaurantTableActive, initialState);

  function confirmStatusChange(event: FormEvent<HTMLFormElement>) {
    const message = isActive
      ? `ยืนยันลบโต๊ะ “${tableName}” จากการใช้งานใช่หรือไม่? ประวัติเดิมจะยังถูกเก็บไว้`
      : `ยืนยันกู้คืนโต๊ะ “${tableName}” ใช่หรือไม่?`;
    if (!window.confirm(message)) event.preventDefault();
  }

  return (
    <form action={formAction} className="table-status-form" onSubmit={confirmStatusChange}>
      <input name="tableId" type="hidden" value={tableId} />
      <input name="isActive" type="hidden" value={String(!isActive)} />
      {state.error ? <small className="table-status-message" role="alert">{state.error}</small> : null}
      {state.success ? <small className="table-status-message success" role="status">{state.success}</small> : null}
      <button className={isActive ? "danger-button compact" : "secondary-button table-restore-button"} disabled={isPending} type="submit">
        {isPending ? "กำลังบันทึก…" : isActive ? "ลบโต๊ะ" : "กู้คืนโต๊ะ"}
      </button>
    </form>
  );
}
