"use client";

import { useActionState } from "react";

import { setRestaurantTableActive, type TableState } from "@/app/settings/tables/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const initialState: TableState = {};

export function TableDeleteButton({ tableId, tableName, isActive }: { tableId: string; tableName: string; isActive: boolean }) {
  const [state, formAction, isPending] = useActionState(setRestaurantTableActive, initialState);

  return (
    <form action={formAction} className="table-status-form">
      <input name="tableId" type="hidden" value={tableId} />
      <input name="isActive" type="hidden" value={String(!isActive)} />
      {state.error ? <small className="table-status-message" role="alert">{state.error}</small> : null}
      {state.success ? <small className="table-status-message success" role="status">{state.success}</small> : null}
      <ConfirmSubmitButton className={isActive ? "danger-button compact" : "secondary-button table-restore-button"} confirmLabel={isActive ? "ลบโต๊ะ" : "กู้คืน"} disabled={isPending} message={isActive ? `ยืนยันลบโต๊ะ “${tableName}” จากการใช้งานใช่หรือไม่? ประวัติเดิมจะยังถูกเก็บไว้` : `ยืนยันกู้คืนโต๊ะ “${tableName}” ใช่หรือไม่?`} title={isActive ? `ลบโต๊ะ ${tableName}` : `กู้คืนโต๊ะ ${tableName}`} titleText={isActive ? "ยืนยันลบโต๊ะ" : "ยืนยันกู้คืนโต๊ะ"}>
        {isPending ? "กำลังบันทึก…" : isActive ? "ลบโต๊ะ" : "กู้คืนโต๊ะ"}
      </ConfirmSubmitButton>
    </form>
  );
}
