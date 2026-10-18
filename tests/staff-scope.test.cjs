const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const permissions = require("../src/lib/permissions.ts");
const { userHasPermission } = require("../src/lib/authorization.ts");

function load(path, mocks) {
  const source = ts.transpileModule(readFileSync(resolve(__dirname, path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: (name) => name in mocks ? mocks[name] : require(name) });
  return exports;
}

const branches = [{ id: "branch-a", name: "สาขา A", code: "A" }, { id: "branch-b", name: "สาขา B", code: "B" }];
const role = { id: "manager", name: "ผู้จัดการ", description: null, permissions: ["user.manage", "pos.use"], isSystem: false, isActive: true, assignmentCount: 1 };

function fixture(initialBranches = []) {
  const assignments = initialBranches.map((branchId, index) => ({ id: `assignment-${index}`, userId: "staff", roleId: role.id, branchId }));
  const calls = { audits: [], createdUsers: [], revalidated: [] };
  const tx = {
    roleAssignment: {
      findMany: async ({ where }) => assignments.filter((item) => item.userId === where.userId && item.roleId === where.roleId),
      create: async ({ data }) => {
        if (assignments.some((item) => item.userId === data.userId && item.roleId === data.roleId && item.branchId === data.branchId)) throw { code: "P2002" };
        const item = { id: `created-${assignments.length}`, ...data };
        assignments.push(item);
        return item;
      },
      update: async ({ where, data }) => Object.assign(assignments.find((item) => item.id === where.id), data),
      delete: async ({ where }) => assignments.splice(assignments.findIndex((item) => item.id === where.id), 1)[0],
    },
    user: { create: async ({ data }) => { calls.createdUsers.push(data); return { id: "new-staff", ...data }; } },
    auditLog: { create: async ({ data }) => calls.audits.push(data) },
  };
  const actions = load("../src/app/settings/staff/actions.ts", {
    "next/cache": { revalidatePath: (path) => calls.revalidated.push(path) },
    "@/lib/permissions": permissions,
    "@/lib/auth": {
      hashPin: async () => "hashed-test-pin",
      requireOrganizationPermission: async (permission) => {
        assert.equal(permission, "user.manage");
        return { id: "owner", organizationId: "shop" };
      },
    },
    "@/lib/db": { db: {
      user: { findFirst: async ({ where }) => where.email ? null : { id: "staff", displayName: "พนักงานทดสอบ", roleAssignments: [] } },
      role: { findFirst: async () => role },
      branch: { findFirst: async ({ where }) => {
        assert.equal(where.organizationId, "shop");
        return branches.find((item) => item.id === where.id) ?? null;
      } },
      $transaction: async (callback) => callback(tx),
    } },
  });
  const form = new FormData();
  Object.entries({ userId: "staff", roleId: role.id, scope: "branch", branchId: "branch-b", displayName: "พนักงานทดสอบ", email: "staff@example.test", pin: "482937", pinConfirmation: "482937" })
    .forEach(([key, value]) => form.set(key, value));
  function render() {
    const { StaffManagement } = load("../src/components/staff-management.tsx", {
      "@/app/settings/staff/actions": actions,
      "@/lib/permissions": permissions,
    });
    return renderToStaticMarkup(React.createElement(StaffManagement, {
      organizationName: "ร้านทดสอบ", currentUserId: "owner", branches,
      roles: [{ ...role, id: "unassigned", name: "บทบาทอื่น" }, role],
      staff: [{ id: "staff", displayName: "พนักงานทดสอบ", email: "staff@example.test", isActive: true, mustChangePin: false,
        assignments: assignments.map((item) => ({ ...item, roleName: role.name, roleIsSystem: false, branchName: branches.find((branch) => branch.id === item.branchId)?.name ?? null })),
      }],
    }));
  }
  return { assignments, actions, form, calls, render };
}

function input(html, id) {
  const result = html.match(new RegExp(`<input\\b[^>]*id="${id}"[^>]*>`))?.[0];
  assert.ok(result, `Missing input ${id}`);
  return result;
}

test("reloading a saved branch assignment selects its role and branch even with organization permissions", () => {
  const html = fixture(["branch-b"]).render();
  assert.match(input(html, "assignment-staff-scope-branch"), /\bchecked=""/);
  assert.doesNotMatch(input(html, "assignment-staff-scope-organization"), /\bchecked=/);
  assert.match(html, /<option value="branch-b" selected="">/);
  assert.match(html, /<option value="manager" selected="">/);
});

test("only an actually global assignment is initially displayed as all branches", () => {
  const html = fixture([null]).render();
  assert.match(input(html, "assignment-staff-scope-organization"), /\bchecked=""/);
  assert.doesNotMatch(input(html, "assignment-staff-scope-branch"), /\bchecked=/);
});

test("new staff default to a branch even when their role contains organization permissions", () => {
  const html = fixture().render();
  assert.match(input(html, "new-staff-scope-branch"), /\bchecked=""/);
  assert.doesNotMatch(input(html, "new-staff-scope-organization"), /\bchecked=/);
});

for (const existing of [[null], [null, "branch-b"]]) {
  test(`saving branch B removes global access and survives reload with existing scopes ${JSON.stringify(existing)}`, async () => {
    const { actions, form, assignments, calls, render } = fixture(existing);
    const result = await actions.addRoleAssignment({}, form);
    assert.equal(result.error, undefined);
    assert.match(result.success, /สาขา B/);
    assert.deepEqual(assignments.map((item) => item.branchId), ["branch-b"]);
    assert.ok(calls.revalidated.includes("/settings/staff"));
    const effective = assignments.map((item) => ({ branchId: item.branchId, role }));
    assert.equal(userHasPermission(effective, "pos.use", "branch-b"), true);
    assert.equal(userHasPermission(effective, "pos.use", "branch-a"), false);
    assert.equal(userHasPermission(effective, "user.manage"), false);
    assert.match(input(render(), "assignment-staff-scope-branch"), /\bchecked=""/);
  });
}

for (const action of ["createStaff", "addRoleAssignment"]) {
  for (const [scope, branchId] of [["branch", ""], ["branch", "ALL"], ["", "branch-b"], ["unknown", "branch-b"]]) {
    test(`${action} rejects incomplete scope ${JSON.stringify([scope, branchId])} without granting global access`, async () => {
      const { actions, form, assignments, calls } = fixture();
      form.set("scope", scope);
      form.set("branchId", branchId);
      assert.match((await actions[action]({}, form)).error, /เลือกขอบเขตสิทธิ์/);
      assert.equal(assignments.length, 0);
      assert.equal(calls.createdUsers.length, 0);
    });
  }
  test(`${action} refuses a branch outside the organization`, async () => {
    const { actions, form, assignments } = fixture();
    form.set("branchId", "other-shop-branch");
    assert.match((await actions[action]({}, form)).error, /ไม่พบสาขา/);
    assert.equal(assignments.length, 0);
  });
  for (const [scope, branchId, expected] of [["branch", "branch-b", "branch-b"], ["organization", "", null]]) {
    test(`${action} persists the explicitly selected ${scope} scope`, async () => {
      const { actions, form, assignments } = fixture();
      form.set("scope", scope);
      form.set("branchId", branchId);
      assert.equal((await actions[action]({}, form)).error, undefined);
      assert.equal(assignments[0].branchId, expected);
    });
  }
}
