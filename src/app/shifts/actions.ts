"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth";
import { closeCashShiftLedger } from "@/lib/cash-shift-service";
import { db } from "@/lib/db";

export type ShiftActionState = { error?: string; success?: string };

function text(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }

function bahtToSatang(value: string) {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const satang = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(satang) ? satang : null;
}

function refresh(branchId: string) {
  revalidatePath("/shifts");
  revalidatePath(`/shifts?branch=${branchId}`);
  revalidatePath(`/pos/${branchId}`);
  revalidatePath("/dashboard");
}

async function managedBranch(branchId: string) {
  const user = await requirePermission("payment.manage", branchId);
  const branch = await db.branch.findFirst({ where: { id: branchId, organizationId: user.organizationId }, select: { id: true } });
  return { user, branch };
}

export async function openCashShift(_: ShiftActionState, formData: FormData): Promise<ShiftActionState> {
  const branchId = text(formData, "branchId");
  const openingCashSatang = bahtToSatang(text(formData, "openingCash"));
  const note = text(formData, "note");
  if (!branchId || openingCashSatang === null || note.length > 200) return { error: "กรอกเงินสดตั้งต้นให้ถูกต้อง" };
  const { user, branch } = await managedBranch(branchId);
  if (!branch) return { error: "ไม่พบสาขา" };
  try {
    const shift = await db.$transaction(async (tx) => {
      const created = await tx.cashShift.create({ data: { branchId, userId: user.id, openingCashSatang, note: note || null } });
      await tx.auditLog.create({ data: { organizationId: user.organizationId, branchId, actorId: user.id, action: "cash_shift.opened", entityType: "CashShift", entityId: created.id, after: { openingCashSatang } } });
      return created;
    });
    refresh(branchId);
    return { success: `เปิดกะแล้ว · เงินตั้งต้น ${(shift.openingCashSatang / 100).toFixed(2)} บาท` };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    return { error: code === "P2002" ? "คุณมีกะที่ยังไม่ปิดอยู่" : "เปิดกะไม่สำเร็จ" };
  }
}

export async function closeCashShift(_: ShiftActionState, formData: FormData): Promise<ShiftActionState> {
  const branchId = text(formData, "branchId");
  const shiftId = text(formData, "shiftId");
  const closingCashSatang = bahtToSatang(text(formData, "closingCash"));
  const note = text(formData, "note");
  if (!branchId || !shiftId || closingCashSatang === null || note.length > 200) return { error: "กรอกยอดเงินสดที่นับได้ให้ถูกต้อง" };
  const { user, branch } = await managedBranch(branchId);
  if (!branch) return { error: "ไม่พบสาขา" };
  try {
    const summary = await db.$transaction(async (tx) => {
      const closed = await closeCashShiftLedger(tx, { branchId, shiftId, userId: user.id, closingCashSatang, note });
      await tx.auditLog.create({ data: { organizationId: user.organizationId, branchId, actorId: user.id, action: "cash_shift.closed", entityType: "CashShift", entityId: closed.shiftId, after: { expectedCashSatang: closed.expectedCashSatang, closingCashSatang, differenceSatang: closed.differenceSatang, cashIn: closed.cashIn, cashOut: closed.cashOut } } });
      return closed;
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 20_000 });
    refresh(branchId);
    return { success: `ปิดกะแล้ว · ยอดควรมี ${(summary.expectedCashSatang / 100).toFixed(2)} บาท · ส่วนต่าง ${(summary.differenceSatang / 100).toFixed(2)} บาท` };
  } catch (error) { return { error: error instanceof Error ? error.message : "ปิดกะไม่สำเร็จ" }; }
}

export async function createPaymentMethod(_: ShiftActionState, formData: FormData): Promise<ShiftActionState> {
  const branchId = text(formData, "branchId");
  const code = text(formData, "code").toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const name = text(formData, "name");
  const isCash = text(formData, "isCash") === "on";
  if (!branchId || !/^[A-Z0-9_]{2,30}$/.test(code) || name.length < 2 || name.length > 60) return { error: "กรอกชื่อและรหัสช่องทางชำระให้ถูกต้อง" };
  const { user, branch } = await managedBranch(branchId);
  if (!branch) return { error: "ไม่พบสาขา" };
  try {
    const method = await db.$transaction(async (tx) => {
      const max = await tx.paymentMethodSetting.aggregate({ where: { branchId }, _max: { sortOrder: true } });
      const created = await tx.paymentMethodSetting.create({ data: { branchId, code, name, isCash, sortOrder: (max._max.sortOrder ?? 0) + 10 } });
      await tx.auditLog.create({ data: { organizationId: user.organizationId, branchId, actorId: user.id, action: "payment_method.created", entityType: "PaymentMethodSetting", entityId: created.id, after: { code, name, isCash } } });
      return created;
    });
    refresh(branchId);
    return { success: `เพิ่มช่องทาง ${method.name} แล้ว` };
  } catch (error) {
    const codeValue = typeof error === "object" && error && "code" in error ? error.code : undefined;
    return { error: codeValue === "P2002" ? "มีรหัสช่องทางนี้แล้ว" : "เพิ่มช่องทางชำระไม่สำเร็จ" };
  }
}

export async function togglePaymentMethod(_: ShiftActionState, formData: FormData): Promise<ShiftActionState> {
  const branchId = text(formData, "branchId");
  const methodId = text(formData, "methodId");
  const isActive = text(formData, "isActive") === "true";
  const { user, branch } = await managedBranch(branchId);
  if (!branch) return { error: "ไม่พบสาขา" };
  const method = await db.paymentMethodSetting.findFirst({ where: { id: methodId, branchId }, select: { id: true, name: true } });
  if (!method) return { error: "ไม่พบช่องทางชำระ" };
  await db.$transaction(async (tx) => {
    await tx.paymentMethodSetting.update({ where: { id: method.id }, data: { isActive } });
    await tx.auditLog.create({ data: { organizationId: user.organizationId, branchId, actorId: user.id, action: isActive ? "payment_method.enabled" : "payment_method.disabled", entityType: "PaymentMethodSetting", entityId: method.id } });
  });
  refresh(branchId);
  return { success: `${isActive ? "เปิด" : "ปิด"} ${method.name} แล้ว` };
}
