"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { inventoryScope, canManageInventoryBranch } from "@/lib/inventory-access";
import { InventoryError, parseQuantity, parseReceiptCost } from "@/lib/inventory-math";
import { recordStockMovement } from "@/lib/inventory-service";

export type InventoryState = { error?: string; success?: string; nextRequestId?: string; recipeVersion?: number };
const options = { maxWait: 10_000, timeout: 30_000, isolationLevel: "Serializable" as const };
function field(form: FormData, key: string) { return String(form.get(key) ?? "").trim(); }
function refresh() { revalidatePath("/inventory"); revalidatePath("/inventory/recipes"); }
function failure(error: unknown): InventoryState {
  if (error instanceof InventoryError) return { error: error.message };
  const code = typeof error === "object" && error && "code" in error ? error.code : "";
  if (code === "P2002") return { error: "ชื่อหรือรายการนี้มีอยู่แล้ว กรุณาตรวจสอบก่อนบันทึกอีกครั้ง" };
  if (code === "P2034") return { error: "ยอดถูกเปลี่ยนระหว่างบันทึก กรุณาตรวจข้อมูลแล้วกดบันทึกอีกครั้ง" };
  return { error: "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง" };
}

export async function saveIngredient(_: InventoryState, form: FormData): Promise<InventoryState> {
  const user = await requirePermission("inventory.manage");
  if (!inventoryScope(user).canManageShared) return { error: "ต้องมีสิทธิ์จัดการวัตถุดิบทุกสาขาเพื่อแก้ไขข้อมูลกลาง" };
  try {
    const id = field(form, "id");
    const name = field(form, "name");
    const unit = field(form, "unit");
    if (!name || name.length > 100 || !["GRAM", "MILLILITER", "PIECE"].includes(unit)) throw new InventoryError("กรอกชื่อไม่เกิน 100 ตัวอักษรและเลือกหน่วยวัตถุดิบ");
    await db.$transaction(async (tx) => {
      const current = id ? await tx.ingredient.findFirst({ where: { id, organizationId: user.organizationId } }) : null;
      if (id && !current) throw new InventoryError("ไม่พบวัตถุดิบนี้");
      if (current && current.unit !== unit) throw new InventoryError("เปลี่ยนหน่วยของวัตถุดิบเดิมไม่ได้ ให้เพิ่มวัตถุดิบใหม่เพื่อรักษาความถูกต้องของประวัติ");
      const data = { name, unit: unit as "GRAM" | "MILLILITER" | "PIECE" };
      const ingredient = current
        ? await tx.ingredient.update({ where: { id: current.id }, data })
        : await tx.ingredient.create({ data: { ...data, organizationId: user.organizationId } });
      await tx.auditLog.create({ data: {
        organizationId: user.organizationId, actorId: user.id, entityType: "Ingredient", entityId: ingredient.id,
        action: current ? "ingredient.updated" : "ingredient.created", after: data,
        ...(current ? { before: { name: current.name, unit: current.unit } } : {}),
      } });
    }, options);
    refresh();
    return { success: id ? "แก้ไขวัตถุดิบแล้ว" : "เพิ่มวัตถุดิบแล้ว" };
  } catch (error) { return failure(error); }
}

export async function toggleIngredient(_: InventoryState, form: FormData): Promise<InventoryState> {
  const user = await requirePermission("inventory.manage");
  if (!inventoryScope(user).canManageShared) return { error: "ต้องมีสิทธิ์จัดการวัตถุดิบทุกสาขา" };
  try {
    const isActive = field(form, "active") === "true";
    await db.$transaction(async (tx) => {
      const ingredient = await tx.ingredient.findFirst({ where: { id: field(form, "id"), organizationId: user.organizationId } });
      if (!ingredient) throw new InventoryError("ไม่พบวัตถุดิบนี้");
      if (!isActive) {
        const [recipes, balances] = await Promise.all([
          tx.recipeItem.count({ where: { ingredientId: ingredient.id } }),
          tx.inventoryBalance.count({ where: { ingredientId: ingredient.id, quantity: { not: 0 } } }),
        ]);
        if (recipes || balances) throw new InventoryError("นำออกจากสูตรและตรวจนับยอดทุกสาขาให้เป็น 0 ก่อนปิดใช้งาน");
      }
      await tx.ingredient.update({ where: { id: ingredient.id }, data: { isActive } });
      await tx.auditLog.create({ data: { organizationId: user.organizationId, actorId: user.id,
        action: "ingredient.active_changed", entityType: "Ingredient", entityId: ingredient.id,
        before: { isActive: ingredient.isActive }, after: { isActive } } });
    }, options);
    refresh(); return { success: isActive ? "เปิดใช้งานแล้ว" : "ปิดใช้งานแล้ว ประวัติยังอยู่ครบ" };
  } catch (error) { return failure(error); }
}

export async function saveStockMovement(_: InventoryState, form: FormData): Promise<InventoryState> {
  const user = await requirePermission("inventory.manage");
  const branchId = field(form, "branchId");
  if (!canManageInventoryBranch(user, branchId)) return { error: "ไม่มีสิทธิ์จัดการสต็อกของสาขานี้" };
  try {
    const type = field(form, "type");
    if (type !== "RECEIPT" && type !== "WASTE" && type !== "COUNT") throw new InventoryError("เลือกประเภทการบันทึก");
    const quantity = parseQuantity(field(form, "quantity"), type === "COUNT");
    const totalSatang = type === "RECEIPT" ? parseReceiptCost(field(form, "cost")) : null;
    const reason = field(form, "reason");
    const requestId = field(form, "requestId");
    if (!reason || reason.length > 250) throw new InventoryError("ระบุเหตุผลหรือเอกสารอ้างอิง ไม่เกิน 250 ตัวอักษร");
    if (!/^[a-f0-9-]{36}$/.test(requestId)) throw new InventoryError("กรุณาโหลดหน้าใหม่ก่อนบันทึก");
    const ingredientId = field(form, "ingredientId");
    const requestHash = createHash("sha256").update(JSON.stringify([branchId, ingredientId, type, quantity.toString(), totalSatang, reason])).digest("hex");
    await db.$transaction(async (tx) => {
      const movement = await recordStockMovement(tx, {
        branchId, ingredientId, organizationId: user.organizationId, type, quantity, totalSatang, reason,
        actorName: user.displayName, idempotencyKey: `manual:${user.id}:${requestId}`, requestHash,
      });
      // An audit entry is only needed for the initial submission of this movement.
      const audited = await tx.auditLog.findFirst({ where: { entityType: "StockMovement", entityId: movement.id } });
      if (!audited) await tx.auditLog.create({ data: { organizationId: user.organizationId, branchId, actorId: user.id,
        action: `inventory.${type.toLowerCase()}`, entityType: "StockMovement", entityId: movement.id, reason,
        after: { quantity: movement.quantity.toString(), balanceAfter: movement.balanceAfter.toString() } } });
    }, options);
    refresh(); return { success: "บันทึกยอดสต็อกแล้ว", nextRequestId: randomUUID() };
  } catch (error) { return { ...failure(error), nextRequestId: field(form, "requestId") }; }
}

export async function saveStockThreshold(_: InventoryState, form: FormData): Promise<InventoryState> {
  const user = await requirePermission("inventory.manage");
  const branchId = field(form, "branchId");
  if (!canManageInventoryBranch(user, branchId)) return { error: "ไม่มีสิทธิ์จัดการสาขานี้" };
  try {
    const ingredientId = field(form, "ingredientId");
    const lowStockThreshold = parseQuantity(field(form, "threshold"), true);
    await db.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({ where: { id: branchId, organizationId: user.organizationId } });
      const ingredient = await tx.ingredient.findFirst({ where: { id: ingredientId, organizationId: user.organizationId, isActive: true } });
      if (!branch || !ingredient) throw new InventoryError("ไม่พบสาขาหรือวัตถุดิบ");
      await tx.inventoryBalance.upsert({ where: { branchId_ingredientId: { branchId, ingredientId } },
        create: { branchId, ingredientId, lowStockThreshold }, update: { lowStockThreshold } });
    }, options);
    refresh(); return { success: "บันทึกจุดเตือนแล้ว" };
  } catch (error) { return failure(error); }
}

export async function saveRecipe(_: InventoryState, form: FormData): Promise<InventoryState> {
  const user = await requirePermission("inventory.manage");
  if (!inventoryScope(user).canManageShared) return { error: "ต้องมีสิทธิ์จัดการวัตถุดิบทุกสาขาเพื่อแก้ไขสูตรกลาง" };
  try {
    const menuItemId = field(form, "menuItemId");
    const version = Number(field(form, "version"));
    const ids = form.getAll("ingredientId").map(String);
    const amounts = form.getAll("quantity").map(String);
    if (!Number.isInteger(version) || version < 0 || ids.length > 50 || ids.length !== amounts.length || new Set(ids).size !== ids.length) throw new InventoryError("สูตรมีวัตถุดิบซ้ำหรือจำนวนไม่ถูกต้อง (สูงสุด 50 รายการ)");
    const lines = ids.map((ingredientId, index) => ({ ingredientId, quantity: parseQuantity(amounts[index]) }));
    await db.$transaction(async (tx) => {
      const menu = await tx.menuItem.findFirst({ where: { id: menuItemId, organizationId: user.organizationId, isActive: true }, include: { recipeItems: true } });
      if (!menu) throw new InventoryError("ไม่พบเมนูนี้");
      if (menu.recipeVersion !== version) throw new InventoryError("สูตรถูกแก้ไขไปแล้ว กรุณาโหลดหน้าใหม่ก่อนบันทึก");
      const ingredients = await tx.ingredient.count({ where: { id: { in: ids }, organizationId: user.organizationId, isActive: true } });
      if (ingredients !== ids.length) throw new InventoryError("มีวัตถุดิบที่ปิดใช้งานหรือไม่อยู่ในร้านนี้");
      await tx.menuItem.update({ where: { id: menu.id }, data: { recipeVersion: { increment: 1 } } });
      await tx.recipeItem.deleteMany({ where: { menuItemId } });
      if (lines.length) await tx.recipeItem.createMany({ data: lines.map((line) => ({ ...line, menuItemId })) });
      await tx.auditLog.create({ data: { organizationId: user.organizationId, actorId: user.id,
        action: "recipe.updated", entityType: "MenuItem", entityId: menuItemId,
        before: { lines: menu.recipeItems.map((line) => ({ ingredientId: line.ingredientId, quantity: line.quantity.toString() })) },
        after: { lines: lines.map((line) => ({ ingredientId: line.ingredientId, quantity: line.quantity.toString() })) } } });
    }, options);
    refresh(); return { success: lines.length ? "บันทึกสูตรแล้ว ใช้กับออเดอร์ใหม่ตั้งแต่ตอนนี้" : "นำสูตรออกแล้ว เมนูนี้จะยังไม่ตัดสต็อก", recipeVersion: version + 1 };
  } catch (error) { return failure(error); }
}
