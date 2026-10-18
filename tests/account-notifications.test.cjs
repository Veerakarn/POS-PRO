const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load({ user = null, allowed = false, scope = { allBranches: false, branchIds: ["branch-a"] } } = {}) {
  const queries = [];
  const mocks = {
    "@/lib/auth": { getCurrentUser: async () => user, getPermissionScope: () => scope },
    "@/lib/authorization": { userHasPermission: () => allowed },
    "@/lib/db": { db: { serviceRequest: {
      count: async (query) => { queries.push(query); return 12; },
      findMany: async (query) => { queries.push(query); return [{ id: "request-a", type: "CHECK_BILL", createdAt: new Date("2026-10-19T00:00:00Z"), table: { name: "โต๊ะ 1" }, branch: { name: "สาขา A" } }]; },
    } } },
  };
  const source = ts.transpileModule(fs.readFileSync("src/app/api/account/notifications/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: (name) => { if (!mocks[name]) throw new Error(name); return mocks[name]; }, Response, Date });
  return { GET: exports.GET, queries };
}

test("notifications require a session and do not query requests without permission", async () => {
  const anonymous = load();
  assert.equal((await anonymous.GET()).status, 401);
  assert.equal(anonymous.queries.length, 0);
  for (const options of [{ user: { organizationId: "org-a", roleAssignments: [] } }, { user: { organizationId: "org-a", mustChangePin: true, roleAssignments: [] }, allowed: true }]) {
    const route = load(options);
    assert.deepEqual(await (await route.GET()).json(), { count: 0, items: [] });
    assert.equal(route.queries.length, 0);
  }
});

test("notifications count and list share organization and branch restrictions", async () => {
  const route = load({ user: { organizationId: "org-a", roleAssignments: [] }, allowed: true });
  const response = await route.GET();
  const data = await response.json();
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(data.count, 12);
  assert.equal(data.items[0].title, "โต๊ะ 1 · ขอเช็กบิล");
  for (const query of route.queries) {
    assert.deepEqual(JSON.parse(JSON.stringify(query.where)), { branch: { organizationId: "org-a" }, branchId: { in: ["branch-a"] }, status: "OPEN" });
  }
  assert.equal(route.queries[1].take, 20);
});

test("global notifications still restrict requests to the user's organization", async () => {
  const route = load({ user: { organizationId: "org-a", roleAssignments: [] }, allowed: true, scope: { allBranches: true, branchIds: [] } });
  await route.GET();
  for (const query of route.queries) {
    assert.equal(query.where.branch.organizationId, "org-a");
    assert.equal(query.where.branchId, undefined);
  }
});
