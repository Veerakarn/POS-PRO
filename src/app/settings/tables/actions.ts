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
