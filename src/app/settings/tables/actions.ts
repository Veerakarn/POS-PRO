"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

export type TableState = {
  error?: string;
  success?: string;
};

function readText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createRestaurantTable(_: TableState, formData: FormData): Promise<TableState> {
  const branchId = readText(formData, "branchId");
  const user = await requirePermission("table.manage", branchId);
  const name = readText(formData, "name");
  const code = readText(formData, "code").toUpperCase();
  const capacity = Number.parseInt(readText(formData, "capacity"), 10);

  if (!branchId || !name || !/^[A-Z0-9_-]{1,12}$/.test(code) || !Number.isInteger(capacity) || capacity < 1 || capacity > 50) {
    return { error: "กรอกชื่อ รหัสโต๊ะ และจำนวนที่นั่ง 1–50 ให้ถูกต้อง" };
  }

  const branch = await db.branch.findFirst({
    where: {
      id: branchId,
      organizationId: user.organizationId,
    },
    select: { id: true },
  });

  if (!branch) return { error: "ไม่พบสาขาที่เลือก" };

  try {
    const table = await db.$transaction(async (tx) => {
      const createdTable = await tx.restaurantTable.create({
        data: {
          branchId: branch.id,
          name,
          code,
          capacity,
          qrSecret: randomBytes(32).toString("base64url"),
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          branchId: branch.id,
          actorId: user.id,
          action: "table.created",
          entityType: "RestaurantTable",
          entityId: createdTable.id,
          after: {
            name: createdTable.name,
            code: createdTable.code,
            capacity: createdTable.capacity,
          },
        },
      });

      return createdTable;
    });

    revalidatePath("/dashboard");
    revalidatePath("/settings/tables");
    return { success: `เพิ่มโต๊ะ ${table.name} แล้ว` };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === "P2002") return { error: "รหัสโต๊ะนี้ถูกใช้แล้วในสาขาที่เลือก" };
    return { error: "เพิ่มโต๊ะไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}

export async function setRestaurantTableActive(_: TableState, formData: FormData): Promise<TableState> {
  const tableId = readText(formData, "tableId");
  const isActiveValue = readText(formData, "isActive");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(tableId) || !["true", "false"].includes(isActiveValue)) {
    return { error: "เลือกโต๊ะที่ต้องการเปลี่ยนสถานะไม่ถูกต้อง" };
  }

  const user = await requirePermission("table.manage");
  const target = await db.restaurantTable.findFirst({
    where: { id: tableId, branch: { organizationId: user.organizationId } },
    select: { id: true, branchId: true },
  });
  if (!target) return { error: "ไม่พบโต๊ะนี้ในองค์กร" };
  await requirePermission("table.manage", target.branchId);

  const isActive = isActiveValue === "true";
  try {
    const result: TableState = await db.$transaction(async (tx): Promise<TableState> => {
      const table = await tx.restaurantTable.findFirst({
        where: { id: target.id, branch: { organizationId: user.organizationId } },
        select: { id: true, branchId: true, name: true, code: true, capacity: true, isActive: true },
      });
      if (!table) return { error: "ไม่พบโต๊ะนี้ในองค์กร" };
      if (table.isActive === isActive) return { success: isActive ? "โต๊ะนี้เปิดใช้งานอยู่แล้ว" : "โต๊ะนี้ถูกปิดใช้งานแล้ว" };

      if (!isActive) {
        const [openSessions, pendingRequests] = await Promise.all([
          tx.tableSession.count({ where: { tableId: table.id, status: { in: ["OPEN", "CHECK_REQUESTED", "PAYMENT_IN_PROGRESS"] } } }),
          tx.serviceRequest.count({ where: { tableId: table.id, status: { in: ["OPEN", "ACKNOWLEDGED"] } } }),
        ]);
        if (openSessions > 0) return { error: "ปิดรอบโต๊ะนี้ใน Counter POS ก่อนลบโต๊ะ" };
        if (pendingRequests > 0) return { error: "จัดการคำขอที่ค้างอยู่ของโต๊ะนี้ก่อนลบโต๊ะ" };
      }

      await tx.restaurantTable.update({ where: { id: table.id }, data: { isActive } });
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          branchId: table.branchId,
          actorId: user.id,
          action: isActive ? "table.restored" : "table.deactivated",
          entityType: "RestaurantTable",
          entityId: table.id,
          before: { name: table.name, code: table.code, capacity: table.capacity, isActive: table.isActive },
          after: { name: table.name, code: table.code, capacity: table.capacity, isActive },
        },
      });

      return { success: isActive ? `กู้คืนโต๊ะ ${table.name} แล้ว` : `ลบโต๊ะ ${table.name} จากการใช้งานแล้ว โดยเก็บประวัติเดิมไว้` };
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 20_000 });

    if (result.success) {
      revalidatePath("/dashboard");
      revalidatePath("/settings/tables");
      revalidatePath("/settings/readiness");
      revalidatePath(`/pos/${target.branchId}`);
      revalidatePath("/audit");
    }
    return result;
  } catch {
    return { error: isActive ? "กู้คืนโต๊ะไม่สำเร็จ กรุณาลองอีกครั้ง" : "ลบโต๊ะไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}
