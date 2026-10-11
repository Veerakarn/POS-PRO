"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { refundPayment, SalesError } from "@/lib/sales-service";

export type RefundState = { error?: string; success?: string };
function text(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }
function bahtToSatang(value: string) {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export async function refundSalePayment(_: RefundState, formData: FormData): Promise<RefundState> {
  const branchId = text(formData, "branchId");
  const paymentId = text(formData, "paymentId");
  const idempotencyKey = text(formData, "idempotencyKey");
  const reason = text(formData, "reason");
  const amountSatang = bahtToSatang(text(formData, "amount"));
  if (!branchId || !paymentId || !idempotencyKey || amountSatang === null || amountSatang < 1 || reason.length < 3 || reason.length > 200) return { error: "กรอกยอดและเหตุผลคืนเงินให้ถูกต้อง" };
  const user = await requirePermission("payment.manage", branchId);
  try {
    const refund = await db.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({ where: { id: branchId, organizationId: user.organizationId }, select: { id: true } });
      if (!branch) throw new SalesError("ไม่พบสาขา");
      const created = await refundPayment(tx, { branchId, paymentId, amountSatang, reason, actorId: user.id, idempotencyKey });
      if (!created.duplicate) await tx.auditLog.create({ data: { organizationId: user.organizationId, branchId, actorId: user.id, action: "payment.refunded", entityType: "Refund", entityId: created.id, reason, after: { paymentId, amountSatang } } });
      return created;
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 20_000 });
    revalidatePath("/sales"); revalidatePath("/dashboard"); revalidatePath("/shifts");
    return { success: `คืนเงิน ${(refund.amountSatang / 100).toFixed(2)} บาทแล้ว` };
  } catch (error) {
    if (error instanceof SalesError) return { error: error.message };
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    return { error: code === "P2002" ? "รายการคืนเงินนี้ถูกบันทึกแล้ว" : "คืนเงินไม่สำเร็จ" };
  }
}
