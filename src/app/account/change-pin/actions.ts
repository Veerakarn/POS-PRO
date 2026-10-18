"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  defaultLandingRoute,
  hashPin,
  requireAuthenticatedUser,
  startSession,
  verifyPin,
} from "@/lib/auth";
import { db } from "@/lib/db";

export type ChangePinState = {
  error?: string;
  success?: boolean;
};

function readText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function changeOwnPin(
  _: ChangePinState,
  formData: FormData,
): Promise<ChangePinState> {
  const user = await requireAuthenticatedUser({ allowMustChangePin: true });
  const currentPin = readText(formData, "currentPin");
  const newPin = readText(formData, "newPin");
  const pinConfirmation = readText(formData, "pinConfirmation");

  if (!/^\d{6}$/.test(currentPin) || !/^\d{6}$/.test(newPin)) {
    return { error: "PIN ต้องเป็นตัวเลข 6 หลัก" };
  }
  if (newPin !== pinConfirmation) {
    return { error: "PIN ใหม่และช่องยืนยันไม่ตรงกัน" };
  }

  const account = await db.user.findFirst({
    where: { id: user.id, organizationId: user.organizationId, isActive: true },
    select: { pinHash: true },
  });
  if (!account?.pinHash || !(await verifyPin(currentPin, account.pinHash))) {
    return { error: "PIN ปัจจุบันไม่ถูกต้อง" };
  }
  if (await verifyPin(newPin, account.pinHash)) {
    return { error: "PIN ใหม่ต้องไม่ซ้ำกับ PIN ปัจจุบัน" };
  }

  const newPinHash = await hashPin(newPin);
  try {
    await db.$transaction(
      async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            pinHash: newPinHash,
            mustChangePin: false,
            failedPinAttempts: 0,
            pinLockedUntil: null,
          },
        });
        await tx.session.deleteMany({ where: { userId: user.id } });
        await tx.auditLog.create({
          data: {
            organizationId: user.organizationId,
            actorId: user.id,
            action: "user.pin_changed",
            entityType: "User",
            entityId: user.id,
          },
        });
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  } catch {
    return { error: "เปลี่ยน PIN ไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }

  await startSession(user.id);
  revalidatePath("/", "layout");
  if (formData.get("presentation") === "drawer" && !user.mustChangePin) return { success: true };
  redirect(defaultLandingRoute(user));
}
