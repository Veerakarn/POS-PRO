const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  defaultRouteForAssignments,
  hasPermissionValue,
  permissionScope,
  userHasPermission,
} = require("../src/lib/authorization.ts");

const assignment = (branchId, permissions, isActive = true) => ({
  branchId,
  role: { permissions, isActive },
});

test("a branch assignment cannot authorize a different branch", () => {
  const assignments = [assignment("branch-a", ["pos.use"])];

  assert.equal(userHasPermission(assignments, "pos.use", "branch-a"), true);
  assert.equal(userHasPermission(assignments, "pos.use", "branch-b"), false);
  assert.deepEqual(permissionScope(assignments, "pos.use"), {
    allBranches: false,
    branchIds: ["branch-a"],
  });
});

test("a global assignment grants branch-scoped permissions to every branch", () => {
  const assignments = [assignment(null, ["kitchen.view"])];

  assert.equal(userHasPermission(assignments, "kitchen.view", "branch-a"), true);
  assert.equal(userHasPermission(assignments, "kitchen.view", "branch-b"), true);
  assert.deepEqual(permissionScope(assignments, "kitchen.view"), {
    allBranches: true,
    branchIds: [],
  });
});

test("organization permissions only count on global assignments", () => {
  const branchManager = [assignment("branch-a", ["user.manage", "menu.manage"])];
  const organizationManager = [assignment(null, ["user.manage", "menu.manage"])];

  assert.equal(userHasPermission(branchManager, "user.manage"), false);
  assert.deepEqual(permissionScope(branchManager, "menu.manage"), {
    allBranches: false,
    branchIds: [],
  });
  assert.equal(userHasPermission(organizationManager, "user.manage"), true);
  assert.deepEqual(permissionScope(organizationManager, "menu.manage"), {
    allBranches: true,
    branchIds: [],
  });
});

test("inactive roles and malformed permission JSON grant no access", () => {
  assert.equal(userHasPermission([assignment(null, ["report.view"], false)], "report.view"), false);

  for (const value of [null, "report.view", { permission: "report.view" }, [null, 12, {}]]) {
    assert.equal(hasPermissionValue(value, "report.view"), false);
  }

  assert.equal(hasPermissionValue(["report.view", { bad: true }], "report.view"), true);
  assert.equal(hasPermissionValue(["made.up"], "made.up"), false);
});

test("mixed branch scopes are unique and deterministic, while global access wins", () => {
  const branchAssignments = [
    assignment("branch-z", ["service.manage"]),
    assignment("branch-a", ["service.manage"]),
    assignment("branch-a", ["service.manage"]),
    assignment("branch-disabled", ["service.manage"], false),
  ];

  assert.deepEqual(permissionScope(branchAssignments, "service.manage"), {
    allBranches: false,
    branchIds: ["branch-a", "branch-z"],
  });
  assert.deepEqual(
    permissionScope([...branchAssignments, assignment(null, ["service.manage"])], "service.manage"),
    {
      allBranches: true,
      branchIds: [],
    },
  );
});

test("default route follows the product priority and ignores unusable assignments", () => {
  assert.equal(defaultRouteForAssignments([assignment("a", ["inventory.manage", "pos.use"])]), "/pos");
  assert.equal(defaultRouteForAssignments([assignment("a", ["kitchen.view", "service.manage"])]), "/kitchen");
  assert.equal(defaultRouteForAssignments([assignment(null, ["report.view", "pos.use"])]), "/dashboard");

  for (const [permission, route, branchId] of [
    ["service.manage", "/requests", "a"],
    ["inventory.manage", "/inventory", "a"],
    ["table.manage", "/settings/tables", "a"],
    ["menu.manage", "/settings/menu", null],
    ["user.manage", "/settings/staff", null],
    ["branch.manage", "/settings/branches", null],
  ]) {
    assert.equal(defaultRouteForAssignments([assignment(branchId, [permission])]), route);
  }

  assert.equal(defaultRouteForAssignments([assignment("a", ["user.manage"])]), "/account/no-access");
  assert.equal(defaultRouteForAssignments([assignment(null, ["report.view"], false)]), "/account/no-access");
  assert.equal(defaultRouteForAssignments([]), "/account/no-access");
});
