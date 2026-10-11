"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveIngredient, toggleIngredient, saveStockMovement, saveStockThreshold, saveRecipe, type InventoryState } from "@/app/inventory/actions";
import { unitLabels } from "@/lib/inventory-labels";

type IngredientOption = { id: string; name: string; unit: keyof typeof unitLabels };
const initial: InventoryState = {};
export function InventoryRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button className="secondary-button" type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "กำลังอัปเดต…" : "อัปเดตยอดล่าสุด"}</button>;
}

function Feedback({ state }: { state: InventoryState }) {
  return <div aria-live="polite">{state.error && <p className="form-error" role="alert">{state.error}</p>}{state.success && <p className="form-success" role="status">{state.success}</p>}</div>;
}

export function IngredientForm({ ingredient }: { ingredient?: IngredientOption }) {
  const [state, action, pending] = useActionState(saveIngredient, initial);
  return <form action={action} className="stock-form">
    <input type="hidden" name="id" value={ingredient?.id ?? ""} />
    <label>ชื่อวัตถุดิบ<input name="name" defaultValue={ingredient?.name} required maxLength={100} placeholder="เช่น เนื้อหมู, นมสด, ไข่ไก่" /></label>
    <label>หน่วยหลัก<select name="unit" defaultValue={ingredient?.unit ?? "GRAM"} disabled={!!ingredient}>
      {Object.entries(unitLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    {ingredient && <input type="hidden" name="unit" value={ingredient.unit} />}
    <small>1 กก. = 1,000 กรัม · 1 ลิตร = 1,000 มล. · หน่วยหลักเปลี่ยนไม่ได้หลังสร้าง</small>
    <Feedback state={state} />
    <button type="submit" className="primary-button" disabled={pending}>{pending ? "กำลังบันทึก…" : ingredient ? "บันทึกชื่อ" : "เพิ่มวัตถุดิบ"}</button>
  </form>;
}

export function IngredientToggle({ id, active }: { id: string; active: boolean }) {
  const [state, action, pending] = useActionState(toggleIngredient, initial);
  return <form action={action} className="stock-form">
    <input type="hidden" name="id" value={id} /><input type="hidden" name="active" value={String(!active)} />
    <button type="submit" className={active ? "danger-button" : "secondary-button"} disabled={pending}>{pending ? "กำลังบันทึก…" : active ? "ปิดใช้งานวัตถุดิบ" : "เปิดใช้งานอีกครั้ง"}</button>
    <Feedback state={state} />
  </form>;
}

export function StockMovementForm({ branchId, ingredients, requestId }: { branchId: string; ingredients: IngredientOption[]; requestId: string }) {
  const [type, setType] = useState("RECEIPT");
  const [ingredientId, setIngredientId] = useState(ingredients[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [reason, setReason] = useState("");
  const [state, action, pending] = useActionState(async (previous: InventoryState, form: FormData) => {
    const result = await saveStockMovement(previous, form);
    if (result.success) { setQuantity(""); setCost(""); setReason(""); }
    return result;
  }, initial);
  const selected = ingredients.find((item) => item.id === ingredientId) ?? ingredients[0];
  if (!ingredients.length) return <p className="empty-state">เพิ่มวัตถุดิบก่อนบันทึกสต็อก</p>;
  return <form action={action} className="stock-form">
    <input type="hidden" name="branchId" value={branchId} />
    <input type="hidden" name="requestId" value={state.nextRequestId ?? requestId} />
    <label>ประเภท<select name="type" value={type} onChange={(event) => { setType(event.target.value); setQuantity(""); }}>
      <option value="RECEIPT">รับสินค้าเข้า</option><option value="WASTE">บันทึกของเสีย</option><option value="COUNT">ปรับตามยอดตรวจนับ</option>
    </select></label>
    <label>วัตถุดิบ<select name="ingredientId" value={selected?.id ?? ""} onChange={(event) => setIngredientId(event.target.value)} required>
      {ingredients.map((item) => <option key={item.id} value={item.id}>{item.name} · {unitLabels[item.unit]}</option>)}
    </select></label>
    <label>{type === "COUNT" ? "ยอดที่นับได้จริง" : "จำนวน"} ({selected ? unitLabels[selected.unit] : "หน่วยหลัก"})
      <input name="quantity" type="number" inputMode="decimal" min={type === "COUNT" ? "0" : "0.001"} max="999999999" step="0.001" required value={quantity} onChange={(event) => setQuantity(event.target.value)} />
    </label>
    {type === "RECEIPT" && <label>ต้นทุนรวมของจำนวนที่รับเข้า (บาท)<input name="cost" type="number" inputMode="decimal" min="0" max="9999999.99" step="0.01" required value={cost} onChange={(event) => setCost(event.target.value)} placeholder="เช่น ซื้อหมู 1,000 กรัม รวม 180 บาท" /></label>}
    {type === "COUNT" && <small>ระบบจะปรับยอดคงเหลือเป็นจำนวนนี้ ใช้สำหรับตั้งยอดเริ่มต้นหรือแก้ยอดผิด หากยังไม่มีราคาทุน ให้รับเข้าพร้อมต้นทุนก่อน</small>}
    <label>เหตุผล / เอกสารอ้างอิง<input name="reason" maxLength={250} required value={reason} onChange={(event) => setReason(event.target.value)} placeholder={type === "COUNT" ? "เช่น ตรวจนับก่อนเปิดร้าน / แก้ยอดรับเข้า" : "เช่น ใบส่งของ 001 / สินค้าหมดอายุ"} /></label>
    <Feedback state={state} />
    <button type="submit" className="primary-button" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกสต็อก"}</button>
  </form>;
}

export function StockThresholdForm({ branchId, ingredientId, threshold, unit }: { branchId: string; ingredientId: string; threshold: string; unit: string }) {
  const [state, action, pending] = useActionState(saveStockThreshold, initial);
  return <form action={action} className="stock-form">
    <input type="hidden" name="branchId" value={branchId} /><input type="hidden" name="ingredientId" value={ingredientId} />
    <label>เตือนเมื่อคงเหลือไม่เกิน ({unit})<input name="threshold" type="number" min="0" max="999999999" step="0.001" defaultValue={threshold} required /></label>
    <button className="secondary-button" disabled={pending} type="submit">{pending ? "กำลังบันทึก…" : "บันทึกจุดเตือน"}</button><Feedback state={state} />
  </form>;
}

export function RecipeForm({ menuItemId, version, lines, ingredients }: {
  menuItemId: string; version: number;
  lines: Array<{ ingredientId: string; quantity: string }>;
  ingredients: IngredientOption[];
}) {
  const [rows, setRows] = useState(lines.map((line) => ({ ...line, key: line.ingredientId })));
  const [editingVersion, setEditingVersion] = useState(version);
  const [state, action, pending] = useActionState(async (previous: InventoryState, form: FormData) => {
    const result = await saveRecipe(previous, form);
    if (result.recipeVersion !== undefined) setEditingVersion(result.recipeVersion);
    return result;
  }, initial);
  const unused = ingredients.filter((ingredient) => !rows.some((row) => row.ingredientId === ingredient.id));
  return <form action={action} className="stock-form recipe-form">
    <input type="hidden" name="menuItemId" value={menuItemId} /><input type="hidden" name="version" value={editingVersion} />
    {rows.length === 0 && <p className="empty-state">ยังไม่มีสูตร · เพิ่มปริมาณวัตถุดิบที่ใช้ต่ออาหาร 1 จาน / เครื่องดื่ม 1 แก้ว</p>}
    {rows.map((row, index) => {
      const selected = ingredients.find((item) => item.id === row.ingredientId);
      return <div className="recipe-line" key={row.key}>
        <label>วัตถุดิบ {index + 1}<select name="ingredientId" value={row.ingredientId} onChange={(event) => setRows(rows.map((item) => item.key === row.key ? { ...item, ingredientId: event.target.value } : item))} required>
          {ingredients.filter((item) => item.id === row.ingredientId || unused.some((other) => other.id === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>จำนวน ({selected ? unitLabels[selected.unit] : "หน่วย"})<input name="quantity" type="number" min="0.001" max="999999999" step="0.001" required value={row.quantity} onChange={(event) => setRows(rows.map((item) => item.key === row.key ? { ...item, quantity: event.target.value } : item))} /></label>
        <button type="button" className="danger-button" aria-label={`นำวัตถุดิบรายการที่ ${index + 1} ออกจากสูตร`} onClick={() => setRows(rows.filter((item) => item.key !== row.key))}>นำออก</button>
      </div>;
    })}
    <div className="inventory-actions">
      <button type="button" className="secondary-button" disabled={pending || !unused.length || rows.length >= 50} onClick={() => setRows([...rows, { key: crypto.randomUUID(), ingredientId: unused[0].id, quantity: "" }])}>+ เพิ่มวัตถุดิบ</button>
      <button type="submit" className="primary-button" disabled={pending}>{pending ? "กำลังบันทึก…" : "บันทึกสูตรต่อ 1 ที่"}</button>
    </div>
    <Feedback state={state} />
  </form>;
}
