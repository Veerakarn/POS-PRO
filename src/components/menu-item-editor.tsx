"use client";

import { useActionState, useState } from "react";

import {
  archiveMenuItem,
  updateMenuItem,
  type MenuState,
} from "@/app/settings/menu/actions";

const initialState: MenuState = {};

type EditableMenuItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceSatang: number;
  sku: string | null;
  imageUrl: string | null;
};

export function MenuItemEditor({
  item,
  categories,
}: {
  item: EditableMenuItem;
  categories: Array<{ id: string; name: string }>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [updateState, updateAction, isUpdating] = useActionState(
    async (previousState: MenuState, formData: FormData) => {
      const nextState = await updateMenuItem(previousState, formData);
      if (nextState.success) setIsEditing(false);
      return nextState;
    },
    initialState,
  );
  const [archiveState, archiveAction, isArchiving] = useActionState(archiveMenuItem, initialState);

  if (!isEditing) {
    return (
      <div className="menu-card-actions">
        <button className="secondary-button compact" onClick={() => setIsEditing(true)} type="button">แก้ไข</button>
        <form action={archiveAction}>
          <input name="menuItemId" type="hidden" value={item.id} />
          <button className="danger-button compact" disabled={isArchiving} type="submit">{isArchiving ? "กำลังลบ…" : "ลบ"}</button>
        </form>
        {archiveState.error ? <p className="form-error" role="alert">{archiveState.error}</p> : null}
      </div>
    );
  }

  return (
    <form action={updateAction} className="menu-edit-form">
      <input name="menuItemId" type="hidden" value={item.id} />
      <label><span>หมวดหมู่</span><select defaultValue={item.categoryId} name="categoryId">{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <div className="form-grid"><label><span>ชื่อเมนู</span><input defaultValue={item.name} name="name" required /></label><label><span>ราคา (บาท)</span><input defaultValue={(item.priceSatang / 100).toFixed(2)} inputMode="decimal" name="price" required /></label></div>
      <label><span>คำอธิบาย</span><input defaultValue={item.description ?? ""} name="description" /></label>
      <div className="form-grid"><label><span>SKU</span><input defaultValue={item.sku ?? ""} name="sku" /></label><label><span>URL รูปภาพ</span><input defaultValue={item.imageUrl ?? ""} name="imageUrl" type="url" /></label></div>
      {updateState.error ? <p className="form-error" role="alert">{updateState.error}</p> : null}
      {updateState.success ? <p className="form-success" role="status">{updateState.success}</p> : null}
      <div className="menu-card-actions"><button className="primary-button compact" disabled={isUpdating} type="submit">{isUpdating ? "กำลังบันทึก…" : "บันทึก"}</button><button className="secondary-button compact" disabled={isUpdating} onClick={() => setIsEditing(false)} type="button">ยกเลิก</button></div>
    </form>
  );
}
