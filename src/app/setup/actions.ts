"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hashPin, startSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { permissionCatalog } from "@/lib/permissions";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestIdentity } from "@/lib/request-identity";
import { redirectAuthenticatedUser } from "@/app/auth-actions";

export type SetupState = {
  error?: string;
};

const initialOwnerPermissions = permissionCatalog.map((permission) => permission.key);

function readText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createInitialOrganization(
  _: SetupState,
  formData: FormData,
): Promise<SetupState> {
  return createOrganization(formData, true);
}

export async function registerOrganization(
  _: SetupState,
  formData: FormData,
): Promise<SetupState> {
  await redirectAuthenticatedUser();
  return createOrganization(formData, false);
}

async function createOrganization(formData: FormData, initialSetup: boolean): Promise<SetupState> {
  const organizationName = readText(formData, "organizationName");
  const organizationSlug = readText(formData, "organizationSlug").toLowerCase();
  const branchName = readText(formData, "branchName");
  const branchCode = readText(formData, "branchCode").toUpperCase();
  const ownerName = readText(formData, "ownerName");
  const ownerEmail = readText(formData, "ownerEmail").toLowerCase();
  const ownerPin = readText(formData, "ownerPin");
  const ownerPinConfirmation = readText(formData, "ownerPinConfirmation");
  const setupToken = readText(formData, "setupToken");

  if (
    !organizationName ||
    organizationName.length > 120 ||
    !branchName ||
    branchName.length > 100 ||
    !ownerName ||
    ownerName.length > 100 ||
    ownerEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) ||
    !/^\d{6}$/.test(ownerPin) ||
    ownerPin !== ownerPinConfirmation
  ) {
    return { error: "กรุณากรอกข้อมูลให้ครบ และตั้ง PIN เจ้าของเป็นตัวเลข 6 หลักให้ตรงกัน" };
  }

  if (organizationSlug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(organizationSlug)) {
    return { error: "รหัสองค์กรใช้ตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น" };
  }

  if (!/^[A-Z0-9_-]{2,12}$/.test(branchCode)) {
    return { error: "รหัสสาขาใช้ตัวอักษรอังกฤษ ตัวเลข _ หรือ - ความยาว 2–12 ตัว" };
  }

  const expectedToken = process.env.INITIAL_SETUP_TOKEN;
  if (initialSetup && process.env.NODE_ENV === "production" && (!expectedToken || setupToken !== expectedToken)) {
    return { error: "รหัสตั้งค่าครั้งแรกไม่ถูกต้อง" };
  }

  let ownerId: string;

  try {
    const requestIdentity = await getRequestIdentity();
    const rateLimit = await consumeRateLimit({
      action: "owner-registration",
      resourceIdentity: requestIdentity ? "all-owners" : ownerEmail,
      requestIdentity,
      limit: 5,
      windowMs: 15 * 60_000,
      blockMs: 15 * 60_000,
    });
    if (!rateLimit.allowed) {
      return { error: "มีการสมัครบ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่" };
    }

    const ownerPinHash = await hashPin(ownerPin);
    const result = await db.$transaction(
      async (tx) => {
        if (initialSetup && await tx.organization.count() > 0) {
          return { error: "ระบบได้รับการตั้งค่าแล้ว หากต้องการร้านใหม่ กรุณาไปที่หน้าสร้างบัญชีและร้านใหม่" };
        }
        const existingUser = await tx.user.findFirst({
          where: { email: { equals: ownerEmail, mode: "insensitive" } },
          select: { id: true },
        });
        if (existingUser) return { error: "อีเมลนี้มีบัญชีในระบบแล้ว กรุณาเข้าสู่ระบบหรือใช้อีเมลอื่น" };

        const organization = await tx.organization.create({
          data: {
            name: organizationName,
            slug: organizationSlug,
            branches: {
              create: {
                name: branchName,
                code: branchCode,
              },
            },
            roles: {
              create: {
                name: "Owner",
                description: "เจ้าของร้าน สิทธิ์ครบทุกส่วนและทุกสาขา",
                isSystem: true,
                permissions: initialOwnerPermissions,
              },
            },
            users: {
              create: {
                email: ownerEmail,
                displayName: ownerName,
                pinHash: ownerPinHash,
              },
            },
          },
          include: {
            roles: true,
            users: true,
          },
        });

        const ownerRole = organization.roles[0];
        const owner = organization.users[0];

        await tx.roleAssignment.create({
          data: {
            userId: owner.id,
            roleId: ownerRole.id,
          },
        });

        await tx.auditLog.create({
          data: {
            organizationId: organization.id,
            actorId: owner.id,
            action: "organization.initialized",
            entityType: "Organization",
            entityId: organization.id,
            after: {
              name: organization.name,
              firstBranch: branchName,
            },
          },
        });

        return { ownerId: owner.id };
      },
      {
        maxWait: 10_000,
        timeout: 15_000,
        isolationLevel: "Serializable",
      },
    );
    if ("error" in result) return { error: result.error };
    ownerId = result.ownerId;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === "P2002") {
      return { error: "รหัสองค์กร รหัสสาขา หรืออีเมลนี้ถูกใช้งานแล้ว" };
    }
    if (code === "P2034") return { error: "มีการสมัครพร้อมกัน กรุณาลองอีกครั้ง" };
    return { error: "สร้างข้อมูลเริ่มต้นไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }

  await startSession(ownerId);
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/login");
  redirect("/dashboard");
}
