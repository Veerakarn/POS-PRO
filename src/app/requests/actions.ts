"use server";

import { revalidatePath } from "next/cache";

import { requireAuthenticatedUser, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

type ServiceRequestActionResult = {
  error?: string;
  success?: string;
};

export async function acknowledgeServiceRequest(formData: FormData): Promise<ServiceRequestActionResult> {
  return updateServiceRequest(formData, "ACKNOWLEDGED");
}

export async function resolveServiceRequest(formData: FormData): Promise<ServiceRequestActionResult> {
  return updateServiceRequest(formData, "RESOLVED");
}

async function updateServiceRequest(
  formData: FormData,
  status: "ACKNOWLEDGED" | "RESOLVED",
): Promise<ServiceRequestActionResult> {
  const user = await requireAuthenticatedUser();
  const requestId = String(formData.get("requestId") ?? "").trim();
  if (!requestId) return { error: "ไม่พบรายการคำขอ" };

  const request = await db.serviceRequest.findFirst({
    where: {
      id: requestId,
      branch: {
        organizationId: user.organizationId,
      },
    },
    select: {
      id: true,
      branchId: true,
      type: true,
      status: true,
    },
  });
  if (!request) {
    return { error: "รายการนี้ถูกปิดหรือไม่มีอยู่แล้ว" };
  }

  await requirePermission("service.manage", request.branchId);

  if (request.status === "RESOLVED" || request.status === "CANCELLED") {
    return { error: "รายการนี้ถูกปิดหรือไม่มีอยู่แล้ว" };
  }

  await db.$transaction(async (tx) => {
    await tx.serviceRequest.update({
      where: { id: request.id },
      data: { status },
    });
    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        branchId: request.branchId,
        actorId: user.id,
        action: status === "ACKNOWLEDGED" ? "service_request.acknowledged" : "service_request.resolved",
        entityType: "ServiceRequest",
        entityId: request.id,
        after: {
          type: request.type,
          status,
        },
      },
    });
  });

  revalidatePath("/requests");
  revalidatePath("/dashboard");

  return {
    success: status === "ACKNOWLEDGED" ? "รับเรื่องแล้ว" : request.type === "CHECK_BILL" ? "ส่งต่อชำระแล้ว" : "ปิดงานแล้ว",
  };
}
