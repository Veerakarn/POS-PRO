import { knownPermissionKeys, organizationPermissionKeys } from "./permissions.ts";

export type Assignment = {
  branchId: string | null;
  role: {
    permissions: unknown;
    isActive: boolean;
  };
};

export type PermissionScope = {
  allBranches: boolean;
  branchIds: string[];
};

function isKnownPermission(permission: string) {
  return knownPermissionKeys.has(permission);
}

export function hasPermissionValue(value: unknown, permission: string) {
  if (!isKnownPermission(permission) || !Array.isArray(value)) {
    return false;
  }

  return value.some((candidate) => candidate === permission);
}

function activeAssignments(assignments: readonly Assignment[]) {
  return assignments.filter((assignment) => assignment.role.isActive === true);
}

export function userHasPermission(
  assignments: readonly Assignment[],
  permission: string,
  branchId?: string,
) {
  if (!isKnownPermission(permission)) {
    return false;
  }

  const organizationScoped = organizationPermissionKeys.has(permission);

  return activeAssignments(assignments).some((assignment) => {
    if (!hasPermissionValue(assignment.role.permissions, permission)) {
      return false;
    }

    if (organizationScoped) {
      return assignment.branchId === null;
    }

    if (branchId === undefined) {
      return true;
    }

    return assignment.branchId === null || assignment.branchId === branchId;
  });
}

export function permissionScope(
  assignments: readonly Assignment[],
  permission: string,
): PermissionScope {
  if (!isKnownPermission(permission)) {
    return { allBranches: false, branchIds: [] };
  }

  const organizationScoped = organizationPermissionKeys.has(permission);
  const matchingAssignments = activeAssignments(assignments).filter((assignment) =>
    hasPermissionValue(assignment.role.permissions, permission),
  );

  if (matchingAssignments.some((assignment) => assignment.branchId === null)) {
    return { allBranches: true, branchIds: [] };
  }

  if (organizationScoped) {
    return { allBranches: false, branchIds: [] };
  }

  return {
    allBranches: false,
    branchIds: [
      ...new Set(
        matchingAssignments
          .map((assignment) => assignment.branchId)
          .filter((id): id is string => id !== null),
      ),
    ].sort(),
  };
}

const defaultRoutes = [
  ["report.view", "/dashboard"],
  ["pos.use", "/pos"],
  ["kitchen.view", "/kitchen"],
  ["service.manage", "/requests"],
  ["payment.manage", "/shifts"],
  ["inventory.manage", "/inventory"],
  ["table.manage", "/settings/tables"],
  ["printer.manage", "/settings/printers"],
  ["menu.manage", "/settings/menu"],
  ["user.manage", "/settings/staff"],
  ["branch.manage", "/settings/branches"],
] as const;

export function defaultRouteForAssignments(assignments: readonly Assignment[]) {
  return (
    defaultRoutes.find(([permission]) => userHasPermission(assignments, permission))?.[1] ??
    "/account/no-access"
  );
}
