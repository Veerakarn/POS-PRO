"use server";

import { revalidatePath } from "next/cache";

import { requireOrganizationPermission } from "@/lib/auth";
import { db } from "@/lib/db";

export type BranchState = {
  error?: string;
  success?: string;
};

function readText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createBranch(_: BranchState, formData: FormData): Promise<BranchState> {
  const user = await requireOrganizationPermission("branch.manage");
  const name = readText(formData, "name");
  const code = readText(formData, "code").toUpperCase();
  const timezone = readText(formData, "timezone") || "Asia/Bangkok";
  const currency = readText(formData, "currency") || "THB";

  if (!name || !/^[A-Z0-9_-]{2,12}$/.test(code)) {
    return { error: "กรุณากรอกชื่อสาขา และรหัสสาขา 2–12 ตัว (A-Z, 0-9, _ หรือ -)" };
  }

  if (!/^[A-Z]{3}$/.test(currency) || !/^Asia\/[A-Za-z_]+$/.test(timezone)) {
    return { error: "เขตเวลา หรือสกุลเงินไม่ถูกต้อง" };
  }

  try {
    const branch = await db.$transaction(async (tx) => {
      const createdBranch = await tx.branch.create({
        data: {
          organizationId: user.organizationId,
          name,
          code,
          timezone,
          currency,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          branchId: createdBranch.id,
          actorId: user.id,
          action: "branch.created",
          entityType: "Branch",
          entityId: createdBranch.id,
          after: {
            name: createdBranch.name,
            code: createdBranch.code,
            timezone: createdBranch.timezone,
            currency: createdBranch.currency,
          },
        },
      });

      return createdBranch;
    });

    revalidatePath("/dashboard");
    revalidatePath("/settings/branches");
    return { success: `เพิ่มสาขา ${branch.name} แล้ว` };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === "P2002") return { error: "รหัสสาขานี้ถูกใช้แล้วในองค์กร" };
    return { error: "เพิ่มสาขาไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}
