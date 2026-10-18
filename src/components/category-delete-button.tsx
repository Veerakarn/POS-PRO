"use client";

import { useActionState } from "react";

import { setMenuCategoryActive, type MenuState } from "@/app/settings/menu/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const initialState: MenuState = {};

export function CategoryDeleteButton({ categoryId, categoryName, isActive }: { categoryId: string; categoryName: string; isActive: boolean }) {
  const [state, formAction, isPending] = useActionState(setMenuCategoryActive, initialState);

  return (
    <form action={formAction} className="category-status-form">
      <input name="categoryId" type="hidden" value={categoryId} />
      <input name="isActive" type="hidden" value={String(!isActive)} />
      {state.error ? <small className="category-status-message" role="alert">{state.error}</small> : null}
      {state.success ? <small className="category-status-message success" role="status">{state.success}</small> : null}
      <ConfirmSubmitButton
        aria-label={isActive ? `ลบหมวดหมู่ ${categoryName}` : `กู้คืนหมวดหมู่ ${categoryName}`}
        className={isActive ? "danger-button compact category-delete-icon-button" : "secondary-button category-restore-button"}
        disabled={isPending}
        message={isActive ? `ยืนยันลบหมวดหมู่ “${categoryName}” จากการใช้งานใช่หรือไม่? สามารถกู้คืนได้ภายหลัง` : `ยืนยันกู้คืนหมวดหมู่ “${categoryName}” ใช่หรือไม่?`}
        title={isActive ? `ลบหมวดหมู่ ${categoryName}` : `กู้คืนหมวดหมู่ ${categoryName}`}
        titleText={isActive ? "ยืนยันลบหมวดหมู่" : "ยืนยันกู้คืนหมวดหมู่"}
      >
        {isPending ? "กำลังบันทึก…" : isActive ? <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg> : "กู้คืน"}
      </ConfirmSubmitButton>
    </form>
  );
}
