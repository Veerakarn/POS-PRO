type InventoryUser = {
  roleAssignments: Array<{ branchId: string | null; role: { permissions: unknown } }>;
};

export function inventoryScope(user: InventoryUser) {
  const assignments = user.roleAssignments.filter(({ role }) =>
    Array.isArray(role.permissions) && role.permissions.includes("inventory.manage"),
  );
  return {
    canManageShared: assignments.some(({ branchId }) => branchId === null),
    branchIds: assignments.flatMap(({ branchId }) => branchId === null ? [] : [branchId]),
  };
}

export function canManageInventoryBranch(user: InventoryUser, branchId: string) {
  const scope = inventoryScope(user);
  return scope.canManageShared || scope.branchIds.includes(branchId);
}
