"use client";

import { useActionState, type FormEvent } from "react";

import { deleteBranch, type BranchState } from "@/app/settings/branches/actions";

const initialState: BranchState = {};

export function BranchDeleteButton({ branchId, branchName }: { branchId: string; branchName: string }) {
  const [state, formAction, isPending] = useActionState(deleteBranch, initialState);

  function confirmDelete(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`ยืนยันลบสาขา “${branchName}” ใช่หรือไม่? สาขาที่มีประวัติการขายจะลบไม่ได้`)) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} className="branch-delete-form" onSubmit={confirmDelete}>
      <input name="branchId" type="hidden" value={branchId} />
      {state.error ? <small className="branch-delete-message" role="alert">{state.error}</small> : null}
      {state.success ? <small className="branch-delete-message success" role="status">{state.success}</small> : null}
      <button className="danger-button compact" disabled={isPending} type="submit">
        {isPending ? "กำลังลบ…" : "ลบสาขา"}
      </button>
    </form>
  );
}
