"use server";

import { revalidatePath } from "next/cache";

import { hashPin, requireOrganizationPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizePermissions } from "@/lib/permissions";

export type StaffActionState = {
  error?: string;
  success?: string;
};

function readText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readScopeBranchId(formData: FormData) {
  const value = readText(formData, "branchId");
  return value && value !== "ALL" ? value : null;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function mutationError(error: unknown, duplicateMessage: string) {
  const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
  return code === "P2002" ? duplicateMessage : "บันทึกข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง";
}

function refreshStaffPages() {
  revalidatePath("/settings/staff");
  revalidatePath("/", "layout");
}

export async function createStaff(
  _: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const actor = await requireOrganizationPermission("user.manage");
  const displayName = readText(formData, "displayName");
  const email = readText(formData, "email").toLowerCase();
  const pin = readText(formData, "pin");
  const pinConfirmation = readText(formData, "pinConfirmation");
  const roleId = readText(formData, "roleId");
  const branchId = readScopeBranchId(formData);

  if (!displayName || displayName.length > 100 || !isValidEmail(email)) {
    return { error: "กรอกชื่อและอีเมลของพนักงานให้ถูกต้อง" };
  }
  if (!/^\d{6}$/.test(pin) || pin !== pinConfirmation) {
    return { error: "PIN ชั่วคราวต้องเป็นตัวเลข 6 หลัก และยืนยันให้ตรงกัน" };
  }

  const [role, branch, duplicateEmail] = await Promise.all([
    db.role.findFirst({
      where: { id: roleId, organizationId: actor.organizationId, isActive: true, isSystem: false },
      select: { id: true, name: true },
    }),
    branchId
      ? db.branch.findFirst({
          where: { id: branchId, organizationId: actor.organizationId },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
    db.user.findFirst({ where: { email }, select: { id: true } }),
  ]);

  if (!role) return { error: "ไม่พบบทบาทที่เปิดใช้งาน กรุณาสร้างหรือเลือกบทบาทใหม่" };
  if (branchId && !branch) return { error: "ไม่พบสาขาที่เลือก" };
  if (duplicateEmail) return { error: "อีเมลนี้มีบัญชีในระบบแล้ว" };

  const pinHash = await hashPin(pin);
  try {
    const staff = await db.$transaction(
      async (tx) => {
        const created = await tx.user.create({
          data: {
            organizationId: actor.organizationId,
            displayName,
            email,
            pinHash,
            mustChangePin: true,
          },
        });
        const assignment = await tx.roleAssignment.create({
          data: { userId: created.id, roleId: role.id, branchId },
        });
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            branchId,
            actorId: actor.id,
            action: "user.created",
            entityType: "User",
            entityId: created.id,
            after: {
              displayName: created.displayName,
              email: created.email,
              roleId: role.id,
              roleName: role.name,
              assignmentId: assignment.id,
              branchId,
              mustChangePin: true,
            },
          },
        });
        return created;
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    refreshStaffPages();
    return { success: `สร้างบัญชี ${staff.displayName} แล้ว พนักงานต้องเปลี่ยน PIN เมื่อเข้าใช้ครั้งแรก` };
  } catch (error) {
    return { error: mutationError(error, "อีเมลนี้มีบัญชีในระบบแล้ว") };
  }
}

export async function updateStaffProfile(
  _: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const actor = await requireOrganizationPermission("user.manage");
  const userId = readText(formData, "userId");
  const displayName = readText(formData, "displayName");
  const email = readText(formData, "email").toLowerCase();
  if (!displayName || displayName.length > 100 || !isValidEmail(email)) {
    return { error: "กรอกชื่อและอีเมลให้ถูกต้อง" };
  }

  const [target, duplicateEmail] = await Promise.all([
    db.user.findFirst({
      where: { id: userId, organizationId: actor.organizationId },
      select: { id: true, displayName: true, email: true },
    }),
    db.user.findFirst({ where: { email, id: { not: userId } }, select: { id: true } }),
  ]);
  if (!target) return { error: "ไม่พบบัญชีพนักงาน" };
  if (duplicateEmail) return { error: "อีเมลนี้มีบัญชีในระบบแล้ว" };

  try {
    await db.$transaction(
      async (tx) => {
        await tx.user.update({ where: { id: target.id }, data: { displayName, email } });
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.id,
            action: "user.updated",
            entityType: "User",
            entityId: target.id,
            before: { displayName: target.displayName, email: target.email },
            after: { displayName, email },
          },
        });
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    refreshStaffPages();
    return { success: "บันทึกข้อมูลพนักงานแล้ว" };
  } catch (error) {
    return { error: mutationError(error, "อีเมลนี้มีบัญชีในระบบแล้ว") };
  }
}

export async function resetStaffPin(
  _: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const actor = await requireOrganizationPermission("user.manage");
  const userId = readText(formData, "userId");
  const pin = readText(formData, "pin");
  const pinConfirmation = readText(formData, "pinConfirmation");
  if (userId === actor.id) return { error: "เปลี่ยน PIN ของตนเองได้จากเมนูชื่อผู้ใช้ด้านบน" };
  if (!/^\d{6}$/.test(pin) || pin !== pinConfirmation) {
    return { error: "PIN ชั่วคราวต้องเป็นตัวเลข 6 หลัก และยืนยันให้ตรงกัน" };
  }

  const target = await db.user.findFirst({
    where: { id: userId, organizationId: actor.organizationId },
    select: {
      id: true,
      displayName: true,
      roleAssignments: { where: { role: { isSystem: true } }, select: { id: true } },
    },
  });
  if (!target) return { error: "ไม่พบบัญชีพนักงาน" };
  if (target.roleAssignments.length) return { error: "บัญชีเจ้าของต้องเปลี่ยน PIN ด้วยตนเอง" };

  const pinHash = await hashPin(pin);
  try {
    await db.$transaction(
      async (tx) => {
        await tx.user.update({
          where: { id: target.id },
          data: {
            pinHash,
            mustChangePin: true,
            failedPinAttempts: 0,
            pinLockedUntil: null,
          },
        });
        await tx.session.deleteMany({ where: { userId: target.id } });
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.id,
            action: "user.pin_reset",
            entityType: "User",
            entityId: target.id,
            after: { mustChangePin: true },
          },
        });
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    refreshStaffPages();
    return { success: `รีเซ็ต PIN ของ ${target.displayName} แล้ว และออกจากระบบทุกอุปกรณ์` };
  } catch {
    return { error: "รีเซ็ต PIN ไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}

export async function toggleStaffStatus(
  _: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const actor = await requireOrganizationPermission("user.manage");
  const userId = readText(formData, "userId");
  const activate = readText(formData, "activate") === "true";
  if (userId === actor.id) return { error: "ไม่สามารถปิดบัญชีที่กำลังใช้งานอยู่" };

  const target = await db.user.findFirst({
    where: { id: userId, organizationId: actor.organizationId },
    select: {
      id: true,
      displayName: true,
      isActive: true,
      roleAssignments: { where: { role: { isSystem: true } }, select: { id: true } },
    },
  });
  if (!target) return { error: "ไม่พบบัญชีพนักงาน" };
  if (target.roleAssignments.length) return { error: "ไม่สามารถปิดบัญชีเจ้าของระบบได้" };

  try {
    await db.$transaction(
      async (tx) => {
        await tx.user.update({ where: { id: target.id }, data: { isActive: activate } });
        if (!activate) await tx.session.deleteMany({ where: { userId: target.id } });
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.id,
            action: activate ? "user.activated" : "user.deactivated",
            entityType: "User",
            entityId: target.id,
            before: { isActive: target.isActive },
            after: { isActive: activate },
          },
        });
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    refreshStaffPages();
    return { success: `${activate ? "เปิด" : "ปิด"}บัญชี ${target.displayName} แล้ว` };
  } catch {
    return { error: "เปลี่ยนสถานะบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}

export async function addRoleAssignment(
  _: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const actor = await requireOrganizationPermission("user.manage");
  const userId = readText(formData, "userId");
  const roleId = readText(formData, "roleId");
  const branchId = readScopeBranchId(formData);

  const [target, role, branch] = await Promise.all([
    db.user.findFirst({
      where: { id: userId, organizationId: actor.organizationId },
      select: {
        id: true,
        displayName: true,
        roleAssignments: { where: { role: { isSystem: true } }, select: { id: true } },
      },
    }),
    db.role.findFirst({
      where: { id: roleId, organizationId: actor.organizationId, isActive: true, isSystem: false },
      select: { id: true, name: true },
    }),
    branchId
      ? db.branch.findFirst({
          where: { id: branchId, organizationId: actor.organizationId },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
  ]);
  if (!target || !role) return { error: "ไม่พบบัญชีหรือบทบาทที่เลือก" };
  if (target.roleAssignments.length) return { error: "ไม่แก้บทบาทของบัญชีเจ้าของระบบ" };
  if (branchId && !branch) return { error: "ไม่พบสาขาที่เลือก" };

  try {
    await db.$transaction(
      async (tx) => {
        const assignment = await tx.roleAssignment.create({
          data: { userId: target.id, roleId: role.id, branchId },
        });
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            branchId,
            actorId: actor.id,
            action: "role_assignment.created",
            entityType: "RoleAssignment",
            entityId: assignment.id,
            after: { userId: target.id, roleId: role.id, roleName: role.name, branchId },
          },
        });
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    refreshStaffPages();
    return { success: `เพิ่มบทบาท ${role.name} ให้ ${target.displayName} แล้ว` };
  } catch (error) {
    return { error: mutationError(error, "พนักงานมีบทบาทและขอบเขตนี้อยู่แล้ว") };
  }
}

export async function removeRoleAssignment(
  _: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const actor = await requireOrganizationPermission("user.manage");
  const assignmentId = readText(formData, "assignmentId");
  const assignment = await db.roleAssignment.findFirst({
    where: { id: assignmentId, user: { organizationId: actor.organizationId } },
    select: {
      id: true,
      branchId: true,
      userId: true,
      roleId: true,
      user: { select: { displayName: true, _count: { select: { roleAssignments: true } } } },
      role: { select: { name: true, isSystem: true, organizationId: true } },
      branch: { select: { organizationId: true } },
    },
  });
  if (
    !assignment ||
    assignment.role.organizationId !== actor.organizationId ||
    (assignment.branch && assignment.branch.organizationId !== actor.organizationId)
  ) return { error: "ไม่พบสิทธิ์ที่ต้องการนำออก" };
  if (assignment.userId === actor.id) return { error: "ไม่สามารถถอดสิทธิ์ของบัญชีที่กำลังใช้งาน" };
  if (assignment.role.isSystem) return { error: "ไม่สามารถถอดบทบาทเจ้าของระบบ" };
  if (assignment.user._count.roleAssignments <= 1) return { error: "พนักงานต้องมีอย่างน้อยหนึ่งบทบาท" };

  try {
    await db.$transaction(
      async (tx) => {
        await tx.roleAssignment.delete({ where: { id: assignment.id } });
        await tx.session.deleteMany({ where: { userId: assignment.userId } });
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            branchId: assignment.branchId,
            actorId: actor.id,
            action: "role_assignment.removed",
            entityType: "RoleAssignment",
            entityId: assignment.id,
            before: {
              userId: assignment.userId,
              roleId: assignment.roleId,
              roleName: assignment.role.name,
              branchId: assignment.branchId,
            },
          },
        });
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    refreshStaffPages();
    return { success: `นำบทบาท ${assignment.role.name} ออกจาก ${assignment.user.displayName} แล้ว` };
  } catch {
    return { error: "นำบทบาทออกไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}

export async function createRole(
  _: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const actor = await requireOrganizationPermission("user.manage");
  const name = readText(formData, "name");
  const description = readText(formData, "description");
  const permissions = normalizePermissions(formData.getAll("permissions").map(String));
  if (name.length < 2 || name.length > 60 || description.length > 240) {
    return { error: "ชื่อบทบาทต้องยาว 2–60 ตัว และคำอธิบายไม่เกิน 240 ตัว" };
  }
  if (!permissions.length) return { error: "เลือกอย่างน้อยหนึ่งสิทธิ์" };

  try {
    const role = await db.$transaction(
      async (tx) => {
        const created = await tx.role.create({
          data: { organizationId: actor.organizationId, name, description: description || null, permissions },
        });
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.id,
            action: "role.created",
            entityType: "Role",
            entityId: created.id,
            after: { name, description: description || null, permissions },
          },
        });
        return created;
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    refreshStaffPages();
    return { success: `สร้างบทบาท ${role.name} แล้ว` };
  } catch (error) {
    return { error: mutationError(error, "ชื่อบทบาทนี้ถูกใช้แล้ว") };
  }
}

export async function updateRole(
  _: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const actor = await requireOrganizationPermission("user.manage");
  const roleId = readText(formData, "roleId");
  const name = readText(formData, "name");
  const description = readText(formData, "description");
  const permissions = normalizePermissions(formData.getAll("permissions").map(String));
  if (name.length < 2 || name.length > 60 || description.length > 240 || !permissions.length) {
    return { error: "กรอกชื่อ คำอธิบาย และเลือกอย่างน้อยหนึ่งสิทธิ์" };
  }

  const role = await db.role.findFirst({
    where: { id: roleId, organizationId: actor.organizationId },
    select: {
      id: true,
      name: true,
      description: true,
      permissions: true,
      isSystem: true,
    },
  });
  if (!role) return { error: "ไม่พบบทบาท" };
  if (role.isSystem) return { error: "บทบาทเจ้าของระบบแก้ไขไม่ได้" };

  try {
    await db.$transaction(
      async (tx) => {
        await tx.role.update({
          where: { id: role.id },
          data: { name, description: description || null, permissions },
        });
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.id,
            action: "role.updated",
            entityType: "Role",
            entityId: role.id,
            before: { name: role.name, description: role.description, permissions: role.permissions },
            after: { name, description: description || null, permissions },
          },
        });
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    refreshStaffPages();
    return { success: `บันทึกบทบาท ${name} แล้ว` };
  } catch (error) {
    return { error: mutationError(error, "ชื่อบทบาทนี้ถูกใช้แล้ว") };
  }
}

export async function toggleRoleStatus(
  _: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const actor = await requireOrganizationPermission("user.manage");
  const roleId = readText(formData, "roleId");
  const activate = readText(formData, "activate") === "true";
  const role = await db.role.findFirst({
    where: { id: roleId, organizationId: actor.organizationId },
    select: {
      id: true,
      name: true,
      isActive: true,
      isSystem: true,
      roleAssignments: {
        where: { user: { isActive: true } },
        select: { userId: true },
      },
    },
  });
  if (!role) return { error: "ไม่พบบทบาท" };
  if (role.isSystem) return { error: "บทบาทเจ้าของระบบปิดใช้งานไม่ได้" };
  if (!activate && role.roleAssignments.length) {
    return { error: "ย้ายพนักงานที่ใช้งานบทบาทนี้ออกก่อนปิดบทบาท" };
  }

  try {
    await db.$transaction(
      async (tx) => {
        await tx.role.update({ where: { id: role.id }, data: { isActive: activate } });
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.id,
            action: activate ? "role.activated" : "role.deactivated",
            entityType: "Role",
            entityId: role.id,
            before: { isActive: role.isActive },
            after: { isActive: activate },
          },
        });
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    refreshStaffPages();
    return { success: `${activate ? "เปิด" : "ปิด"}บทบาท ${role.name} แล้ว` };
  } catch {
    return { error: "เปลี่ยนสถานะบทบาทไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }
}
