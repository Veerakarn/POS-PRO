"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hashPin, startSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { permissionCatalog } from "@/lib/permissions";

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
    !branchName ||
    !ownerName ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) ||
    !/^\d{6}$/.test(ownerPin) ||
    ownerPin !== ownerPinConfirmation
  ) {
    return { error: "กรุณากรอกข้อมูลให้ครบ และตั้ง PIN เจ้าของเป็นตัวเลข 6 หลักให้ตรงกัน" };
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(organizationSlug)) {
    return { error: "รหัสองค์กรใช้ตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น" };
  }

  if (!/^[A-Z0-9_-]{2,12}$/.test(branchCode)) {
    return { error: "รหัสสาขาใช้ตัวอักษรอังกฤษ ตัวเลข _ หรือ - ความยาว 2–12 ตัว" };
  }

  const expectedToken = process.env.INITIAL_SETUP_TOKEN;
  if (process.env.NODE_ENV === "production" && (!expectedToken || setupToken !== expectedToken)) {
    return { error: "รหัสตั้งค่าครั้งแรกไม่ถูกต้อง" };
  }

  const organizationCount = await db.organization.count();
  if (organizationCount > 0) {
    return { error: "ระบบได้รับการตั้งค่าแล้ว โปรดเข้าสู่ระบบด้วยบัญชีเจ้าของร้าน" };
  }

  const ownerPinHash = await hashPin(ownerPin);

  let ownerId: string;

  try {
    ownerId = await db.$transaction(
      async (tx) => {
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

        return owner.id;
      },
      {
        maxWait: 10_000,
        timeout: 15_000,
      },
    );
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
    if (code === "P2002") {
      return { error: "รหัสองค์กร รหัสสาขา หรืออีเมลนี้ถูกใช้งานแล้ว" };
    }
    return { error: "สร้างข้อมูลเริ่มต้นไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }

  await startSession(ownerId);
  revalidatePath("/");
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
