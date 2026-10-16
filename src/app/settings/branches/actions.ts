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

export async function deleteBranch(_: BranchState, formData: FormData): Promise<BranchState> {
  const user = await requireOrganizationPermission("branch.manage");
  const branchId = readText(formData, "branchId");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(branchId)) return { error: "เลือกสาขาที่ต้องการลบไม่ถูกต้อง" };

  try {
    const result = await db.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id: branchId, organizationId: user.organizationId },
        select: { id: true, name: true, code: true },
      });
      if (!branch) return { error: "ไม่พบสาขานี้ในองค์กร" };

      const branchCount = await tx.branch.count({ where: { organizationId: user.organizationId } });
      if (branchCount <= 1) return { error: "องค์กรต้องมีอย่างน้อย 1 สาขา จึงลบสาขาสุดท้ายไม่ได้" };

      const [tableSessions, orders, bills, cashShifts, stockMovements, inventoryBalances, serviceRequests, printJobs, refunds, taxInvoices] = await Promise.all([
        tx.tableSession.count({ where: { branchId } }),
        tx.order.count({ where: { branchId } }),
        tx.bill.count({ where: { branchId } }),
        tx.cashShift.count({ where: { branchId } }),
        tx.stockMovement.count({ where: { branchId } }),
        tx.inventoryBalance.count({ where: { branchId } }),
        tx.serviceRequest.count({ where: { branchId } }),
        tx.printJob.count({ where: { branchId } }),
        tx.refund.count({ where: { branchId } }),
        tx.taxInvoice.count({ where: { organizationId: user.organizationId, bill: { branchId } } }),
      ]);

      if ([tableSessions, orders, bills, cashShifts, stockMovements, inventoryBalances, serviceRequests, printJobs, refunds, taxInvoices].some((count) => count > 0)) {
        return { error: "ลบสาขานี้ไม่ได้ เพราะมีประวัติการขายหรือการดำเนินงานอยู่ ข้อมูลเหล่านี้ต้องเก็บไว้ตรวจสอบย้อนหลัง" };
      }

      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          branchId: branch.id,
          actorId: user.id,
          action: "branch.deleted",
          entityType: "Branch",
          entityId: branch.id,
          before: { name: branch.name, code: branch.code },
        },
      });
      await tx.branch.delete({ where: { id: branch.id } });
      return { success: `ลบสาขา ${branch.name} แล้ว` };
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 20_000 });

    if (result.success) {
      revalidatePath("/dashboard");
      revalidatePath("/settings/branches");
      revalidatePath("/reports");
      revalidatePath("/audit");
    }
    return result;
  } catch {
    return { error: "ลบสาขาไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}
