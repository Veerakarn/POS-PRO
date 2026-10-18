"use client";

import { useActionState } from "react";

import { deleteBranch, type BranchState } from "@/app/settings/branches/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const initialState: BranchState = {};

export function BranchDeleteButton({ branchId, branchName }: { branchId: string; branchName: string }) {
  const [state, formAction, isPending] = useActionState(deleteBranch, initialState);

  return (
    <form action={formAction} className="branch-delete-form">
      <input name="branchId" type="hidden" value={branchId} />
      {state.error ? <small className="branch-delete-message" role="alert">{state.error}</small> : null}
      {state.success ? <small className="branch-delete-message success" role="status">{state.success}</small> : null}
      <ConfirmSubmitButton className="danger-button compact" disabled={isPending} message={`ยืนยันลบสาขา “${branchName}” ใช่หรือไม่? สาขาที่มีประวัติการขายจะลบไม่ได้`} title="ลบสาขา" titleText="ยืนยันลบสาขา">
        {isPending ? "กำลังลบ…" : "ลบสาขา"}
      </ConfirmSubmitButton>
    </form>
  );
}
