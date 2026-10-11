import "server-only";

import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  defaultRouteForAssignments,
  permissionScope,
  userHasPermission,
  type Assignment,
} from "@/lib/authorization";
import { db } from "@/lib/db";
import { organizationPermissionKeys } from "@/lib/permissions";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "pospro_session";
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const KEY_LENGTH = 64;

export type SessionUser = {
  id: string;
  organizationId: string;
  email: string;
  displayName: string;
  mustChangePin: boolean;
  roleAssignments: Array<{
    branchId: string | null;
    role: {
      id: string;
      name: string;
      permissions: unknown;
      isActive: boolean;
      isSystem: boolean;
    };
  }>;
};

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(pin, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPin(pin: string, storedHash: string) {
  const [salt, expectedHash] = storedHash.split(":");
  if (!salt || !expectedHash) return false;

  const derived = (await scrypt(pin, salt, KEY_LENGTH)) as Buffer;
  const expected = Buffer.from(expectedHash, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export async function startSession(userId: string, token = createSessionToken()) {
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

  await db.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function endSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          organizationId: true,
          email: true,
          displayName: true,
          isActive: true,
          mustChangePin: true,
          roleAssignments: {
            select: {
              branchId: true,
              branch: {
                select: { organizationId: true },
              },
              role: {
                select: {
                  id: true,
                  name: true,
                  permissions: true,
                  isActive: true,
                  isSystem: true,
                  organizationId: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!session || session.expiresAt <= new Date() || !session.user.isActive) return null;

  const validAssignments = session.user.roleAssignments
    .filter((assignment) =>
      assignment.role.organizationId === session.user.organizationId &&
      assignment.role.isActive &&
      (!assignment.branch || assignment.branch.organizationId === session.user.organizationId),
    )
    .map((assignment) => ({
      branchId: assignment.branchId,
      role: {
        id: assignment.role.id,
        name: assignment.role.name,
        permissions: assignment.role.permissions,
        isActive: assignment.role.isActive,
        isSystem: assignment.role.isSystem,
      },
    }));

  return {
    id: session.user.id,
    organizationId: session.user.organizationId,
    email: session.user.email,
    displayName: session.user.displayName,
    mustChangePin: session.user.mustChangePin,
    roleAssignments: validAssignments,
  };
});

export async function requireAuthenticatedUser(options?: { allowMustChangePin?: boolean }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePin && !options?.allowMustChangePin) redirect("/account/change-pin");
  return user;
}

export function defaultLandingRoute(user: { roleAssignments: readonly Assignment[] }) {
  return defaultRouteForAssignments(user.roleAssignments);
}

export function getPermissionScope(user: { roleAssignments: readonly Assignment[] }, permission: string) {
  return permissionScope(user.roleAssignments, permission);
}

export async function requirePermission(permission: string, branchId?: string) {
  const user = await requireAuthenticatedUser();

  const permitted = userHasPermission(user.roleAssignments, permission, branchId);

  if (!permitted) redirect("/account/no-access");

  if (branchId) {
    const branch = await db.branch.findFirst({
      where: { id: branchId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!branch) redirect("/account/no-access");
  }

  return user;
}

export async function requireOrganizationPermission(permission: string) {
  if (!organizationPermissionKeys.has(permission)) {
    throw new Error(`Permission ${permission} is not organization-scoped`);
  }

  const user = await requireAuthenticatedUser();
  if (!userHasPermission(user.roleAssignments, permission)) redirect("/account/no-access");
  return user;
}
