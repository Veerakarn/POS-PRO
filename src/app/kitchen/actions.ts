"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

type KitchenResult = { error?: string; success?: string };
const activeSessions = ["OPEN", "CHECK_REQUESTED", "PAYMENT_IN_PROGRESS"] as const;

export async function updateKitchenOrder(input: {
  branchId: string; orderId: string; stationId: string | null; status: "ACKNOWLEDGED" | "SERVED";
}): Promise<KitchenResult> {
  if (!input.branchId || !input.orderId || !["ACKNOWLEDGED", "SERVED"].includes(input.status)) return { error: "ข้อมูลออเดอร์ไม่ถูกต้อง" };
  const user = await requirePermission("kitchen.view", input.branchId);
  try {
    const result = await db.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({ where: { id: input.branchId, organizationId: user.organizationId }, select: { orderStatusTrackingEnabled: true } });
      if (!branch) return { error: "ไม่พบสาขา" };
      if (!branch.orderStatusTrackingEnabled) return { error: "สาขานี้ปิดการติดตามสถานะแล้ว" };
      const route = { station: { branchId: input.branchId, isActive: true }, ...(input.stationId ? { stationId: input.stationId } : {}) };
      const changed = await tx.orderItem.updateMany({
        where: {
          orderId: input.orderId,
          status: input.status === "ACKNOWLEDGED" ? "NEW" : { in: ["ACKNOWLEDGED", "PREPARING", "READY"] },
          order: { branchId: input.branchId, status: { not: "CANCELLED" }, tableSession: { status: { in: [...activeSessions] } } },
          menuItem: { stationRoutes: input.stationId ? { some: route } : { none: route } },
        },
        data: { status: input.status },
      });
      if (!changed.count) return { error: "รายการเปลี่ยนสถานะไปแล้วหรือโต๊ะปิดแล้ว กรุณาโหลดคิวใหม่" };
      await tx.auditLog.create({ data: {
        organizationId: user.organizationId, branchId: input.branchId, actorId: user.id,
        action: "kitchen.order_status_updated", entityType: "Order", entityId: input.orderId,
        after: { stationId: input.stationId, status: input.status, itemCount: changed.count },
      } });
      return { success: input.status === "ACKNOWLEDGED" ? "รับออเดอร์แล้ว" : "บันทึกเสิร์ฟแล้ว" };
    }, { isolationLevel: "Serializable" });
    revalidatePath(`/kitchen/${input.branchId}`);
    revalidatePath(`/pos/${input.branchId}`);
    return result;
  } catch { return { error: "บันทึกสถานะไม่สำเร็จ กรุณาลองอีกครั้ง" }; }
}

export async function setKitchenTracking(input: { branchId: string; enabled: boolean }): Promise<KitchenResult> {
  if (!input.branchId || typeof input.enabled !== "boolean") return { error: "ข้อมูลไม่ถูกต้อง" };
  const user = await requirePermission("kitchen.view", input.branchId);
  try {
    await db.$transaction(async (tx) => {
      const changed = await tx.branch.updateMany({ where: { id: input.branchId, organizationId: user.organizationId }, data: { orderStatusTrackingEnabled: input.enabled } });
      if (!changed.count) throw new Error("Branch unavailable");
      await tx.auditLog.create({ data: {
        organizationId: user.organizationId, branchId: input.branchId, actorId: user.id,
        action: "kitchen.tracking_changed", entityType: "Branch", entityId: input.branchId,
        after: { enabled: input.enabled },
      } });
    }, { isolationLevel: "Serializable" });
    revalidatePath(`/kitchen/${input.branchId}`);
    return { success: input.enabled ? "เปิดการติดตามสถานะแล้ว" : "ปิดการติดตามสถานะแล้ว ลูกค้าจะไม่เห็นสถานะอาหาร" };
  } catch { return { error: "เปลี่ยนการตั้งค่าไม่สำเร็จ กรุณาลองอีกครั้ง" }; }
}
