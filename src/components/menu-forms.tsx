"use client";

import { useActionState } from "react";
import { MenuImageFields } from "@/components/menu-image-fields";

import {
  createMenuCategory,
  createMenuItem,
  type MenuState,
} from "@/app/settings/menu/actions";

const initialState: MenuState = {};

export function CategoryForm() {
  const [state, formAction, isPending] = useActionState(createMenuCategory, initialState);
  return (
    <form action={formAction} className="inline-form">
      <label>
        <span>ชื่อหมวดหมู่</span>
        <input name="name" placeholder="เช่น อาหารจานเดียว" required />
      </label>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="form-success" role="status">{state.success}</p> : null}
      <button className="primary-button compact" disabled={isPending} type="submit">{isPending ? "กำลังเพิ่ม…" : "เพิ่มหมวดหมู่"}</button>
    </form>
  );
}

export function MenuItemForm({ categories }: { categories: Array<{ id: string; name: string }> }) {
  const [state, formAction, isPending] = useActionState(createMenuItem, initialState);
  const hasCategories = categories.length > 0;
  return (
    <form action={formAction} className="branch-form">
      <label>
        <span>หมวดหมู่</span>
        <select disabled={!hasCategories} name="categoryId" required>
          {hasCategories ? categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>) : <option>เพิ่มหมวดหมู่ก่อน</option>}
        </select>
      </label>
      <div className="form-grid">
        <label>
          <span>ชื่อเมนู</span>
          <input disabled={!hasCategories} name="name" placeholder="เช่น ข้าวกะเพราหมู" required />
        </label>
        <label>
          <span>ราคา (บาท)</span>
          <input disabled={!hasCategories} inputMode="decimal" name="price" placeholder="89" required />
        </label>
      </div>
      <label>
        <span>คำอธิบาย</span>
        <input disabled={!hasCategories} name="description" placeholder="ไม่บังคับ" />
      </label>
      <div className="form-grid">
        <label>
          <span>SKU</span>
          <input disabled={!hasCategories} name="sku" placeholder="KRP01 (ไม่บังคับ)" />
        </label>
      </div>
      <MenuImageFields disabled={!hasCategories || isPending} />
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="form-success" role="status">{state.success}</p> : null}
      <button className="primary-button" disabled={isPending || !hasCategories} type="submit">{isPending ? "กำลังเพิ่มเมนู…" : "เพิ่มเมนู"}</button>
    </form>
  );
}
