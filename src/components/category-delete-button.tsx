"use client";

import { useActionState, type FormEvent } from "react";

import { setMenuCategoryActive, type MenuState } from "@/app/settings/menu/actions";

const initialState: MenuState = {};

export function CategoryDeleteButton({ categoryId, categoryName, isActive }: { categoryId: string; categoryName: string; isActive: boolean }) {
  const [state, formAction, isPending] = useActionState(setMenuCategoryActive, initialState);

  function confirmStatusChange(event: FormEvent<HTMLFormElement>) {
    const message = isActive
      ? `ยืนยันลบหมวดหมู่ “${categoryName}” จากการใช้งานใช่หรือไม่? สามารถกู้คืนได้ภายหลัง`
      : `ยืนยันกู้คืนหมวดหมู่ “${categoryName}” ใช่หรือไม่?`;
    if (!window.confirm(message)) event.preventDefault();
  }

  return (
    <form action={formAction} className="category-status-form" onSubmit={confirmStatusChange}>
      <input name="categoryId" type="hidden" value={categoryId} />
      <input name="isActive" type="hidden" value={String(!isActive)} />
      {state.error ? <small className="category-status-message" role="alert">{state.error}</small> : null}
      {state.success ? <small className="category-status-message success" role="status">{state.success}</small> : null}
      <button className={isActive ? "danger-button compact" : "secondary-button category-restore-button"} disabled={isPending} type="submit">
        {isPending ? "กำลังบันทึก…" : isActive ? "ลบหมวดหมู่" : "กู้คืน"}
      </button>
    </form>
  );
}
