"use server";

import { redirect } from "next/navigation";

import {
  defaultLandingRoute,
  endSession,
  getCurrentUser,
  hashPin,
  startSession,
  verifyPin,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestIdentity } from "@/lib/request-identity";

export type AccessState = {
  error?: string;
};

function readText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function isValidPin(pin: string) {
  return /^\d{6}$/.test(pin);
}

function isValidEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function claimOwnerAccess(_: AccessState, formData: FormData): Promise<AccessState> {
  const email = readText(formData, "email").toLowerCase();
  const pin = readText(formData, "pin");
  const pinConfirmation = readText(formData, "pinConfirmation");
  const setupToken = readText(formData, "setupToken");

  if (!isValidEmail(email) || !isValidPin(pin) || pin !== pinConfirmation || setupToken.length > 512) {
    return { error: "กรอกอีเมลที่ลงทะเบียนไว้ และ PIN ตัวเลข 6 หลักที่ตรงกัน" };
  }

  const expectedToken = process.env.INITIAL_SETUP_TOKEN;
  if (process.env.NODE_ENV === "production" && (!expectedToken || setupToken !== expectedToken)) {
    return { error: "รหัสตั้งค่าครั้งแรกไม่ถูกต้อง" };
  }

  const owner = await db.user.findFirst({
    where: {
      email,
      isActive: true,
      pinHash: null,
      roleAssignments: {
        some: {
          role: {
            name: "Owner",
          },
        },
      },
    },
    select: { id: true },
  });

  if (!owner) {
    return { error: "ไม่พบบัญชีเจ้าของที่รอเปิดใช้ หรือบัญชีนี้เปิดใช้แล้ว" };
  }

  const pinHash = await hashPin(pin);
  const claimed = await db.user.updateMany({
    where: {
      id: owner.id,
      pinHash: null,
    },
    data: { pinHash },
  });

  if (claimed.count !== 1) {
    return { error: "บัญชีนี้ถูกเปิดใช้แล้ว กรุณาเข้าสู่ระบบ" };
  }

  await startSession(owner.id);
  redirect("/dashboard");
}

export async function login(_: AccessState, formData: FormData): Promise<AccessState> {
  const email = readText(formData, "email").toLowerCase();
  const pin = readText(formData, "pin");

  if (!isValidEmail(email) || !isValidPin(pin)) {
    return { error: "กรอกอีเมลและ PIN ตัวเลข 6 หลัก" };
  }

  const requestIdentity = await getRequestIdentity();
  if (requestIdentity) {
    const requestRateLimit = await consumeRateLimit({
      action: "staff-login-request",
      resourceIdentity: "all-users",
      requestIdentity,
      limit: 60,
      windowMs: 15 * 60_000,
      blockMs: 15 * 60_000,
    });
    if (!requestRateLimit.allowed) {
      return { error: "มีการลองเข้าสู่ระบบบ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่" };
    }
  }

  const users = await db.user.findMany({
    where: {
      email,
      isActive: true,
      pinHash: { not: null },
    },
    take: 2,
    select: {
      id: true,
      organizationId: true,
      pinHash: true,
      mustChangePin: true,
      failedPinAttempts: true,
      pinLockedUntil: true,
      roleAssignments: {
        where: { role: { isActive: true } },
        select: {
          branchId: true,
          role: {
            select: {
              permissions: true,
              isActive: true,
            },
          },
        },
      },
    },
  });
  const user = users.length === 1 ? users[0] : null;

  if (!user || !user.pinHash) {
    return { error: "อีเมลหรือ PIN ไม่ถูกต้อง" };
  }

  const accountRateLimit = await consumeRateLimit({
    action: "staff-login",
    resourceIdentity: user.id,
    requestIdentity,
    limit: 12,
    windowMs: 15 * 60_000,
    blockMs: 15 * 60_000,
  });
  if (!accountRateLimit.allowed) {
    return { error: "มีการลองเข้าสู่ระบบบ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่" };
  }

  const now = new Date();
  if (user.pinLockedUntil && user.pinLockedUntil > now) {
    return { error: "บัญชีถูกพักการเข้าสู่ระบบชั่วคราว กรุณาลองใหม่ภายหลัง" };
  }

  if (!(await verifyPin(pin, user.pinHash))) {
    const attempts = user.pinLockedUntil ? 1 : user.failedPinAttempts + 1;
    const shouldLock = attempts >= 5;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedPinAttempts: shouldLock ? 0 : attempts,
        pinLockedUntil: shouldLock ? new Date(now.getTime() + 15 * 60 * 1000) : null,
      },
    });
    return { error: "อีเมลหรือ PIN ไม่ถูกต้อง" };
  }

  if (user.failedPinAttempts || user.pinLockedUntil) {
    await db.user.update({
      where: { id: user.id },
      data: { failedPinAttempts: 0, pinLockedUntil: null },
    });
  }

  await db.auditLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      action: "auth.login_succeeded",
      entityType: "User",
      entityId: user.id,
    },
  });

  await startSession(user.id);
  redirect(user.mustChangePin ? "/account/change-pin" : defaultLandingRoute(user));
}

export async function redirectAuthenticatedUser() {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePin ? "/account/change-pin" : defaultLandingRoute(user));
}

export async function logout() {
  await endSession();
  redirect("/login");
}
