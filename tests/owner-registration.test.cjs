const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = ts.transpileModule(readFileSync(resolve(__dirname, "../src/app/setup/actions.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function registrationFixture({ duplicate = false, allowed = true, setupToken } = {}) {
  const calls = { organizations: [], assignments: [], sessions: [], audits: [] };
  const tx = {
    organization: {
      count: async () => 1, // Another restaurant already exists.
      create: async (input) => {
        calls.organizations.push(input.data);
        return { id: "new-shop", name: input.data.name, roles: [{ id: "new-owner-role" }], users: [{ id: "new-owner" }] };
      },
    },
    user: { findFirst: async () => duplicate ? { id: "existing-user" } : null },
    roleAssignment: { create: async (input) => calls.assignments.push(input.data) },
    auditLog: { create: async (input) => calls.audits.push(input.data) },
  };
  const mocks = {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: (path) => { throw new Error(`REDIRECT:${path}`); } },
    "@/app/auth-actions": { redirectAuthenticatedUser: async () => {} },
    "@/lib/auth": { hashPin: async () => "hashed-pin", startSession: async (id) => calls.sessions.push(id) },
    "@/lib/db": { db: { $transaction: async (callback, options) => {
      assert.equal(options.isolationLevel, "Serializable");
      return callback(tx);
    } } },
    "@/lib/permissions": { permissionCatalog: [{ key: "report.view" }, { key: "user.manage" }] },
    "@/lib/rate-limit": { consumeRateLimit: async () => ({ allowed }) },
    "@/lib/request-identity": { getRequestIdentity: async () => "127.0.0.1" },
  };
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require: (name) => {
      assert.ok(name in mocks, `Unexpected dependency: ${name}`);
      return mocks[name];
    },
    process: { env: { NODE_ENV: "production", INITIAL_SETUP_TOKEN: setupToken } },
  });
  const form = new FormData();
  Object.entries({
    organizationName: "New restaurant", organizationSlug: "new-restaurant",
    branchName: "First branch", branchCode: "main", ownerName: "New owner",
    ownerEmail: " NEW-OWNER@EXAMPLE.TEST ", ownerPin: "483920", ownerPinConfirmation: "483920",
  }).forEach(([name, value]) => form.set(name, value));
  return { actions: exports, calls, form };
}

test("a new owner can register in production when other restaurants exist, without a setup token", async () => {
  const { actions, calls, form } = registrationFixture();
  await assert.rejects(actions.registerOrganization({}, form), /REDIRECT:\/dashboard/);
  assert.equal(calls.organizations.length, 1);
  assert.equal(calls.organizations[0].users.create.email, "new-owner@example.test");
  assert.equal(calls.organizations[0].users.create.pinHash, "hashed-pin");
  assert.equal(calls.organizations[0].branches.create.code, "MAIN");
  assert.equal(calls.organizations[0].roles.create.name, "Owner");
  assert.equal(calls.assignments[0].userId, "new-owner");
  assert.equal(calls.assignments[0].roleId, "new-owner-role");
  assert.equal(calls.audits[0].organizationId, "new-shop");
  assert.deepEqual(calls.sessions, ["new-owner"]);
});

test("duplicate emails cannot create another shop or session", async () => {
  const { actions, calls, form } = registrationFixture({ duplicate: true });
  assert.match((await actions.registerOrganization({}, form)).error, /อีเมลนี้มีบัญชี/);
  assert.equal(calls.organizations.length, 0);
  assert.equal(calls.sessions.length, 0);
});

test("mismatched PIN confirmation is rejected before creating a shop", async () => {
  const { actions, calls, form } = registrationFixture();
  form.set("ownerPinConfirmation", "000000");
  assert.match((await actions.registerOrganization({}, form)).error, /PIN/);
  assert.equal(calls.organizations.length, 0);
});

test("rate-limited registration creates neither a shop nor a session", async () => {
  const { actions, calls, form } = registrationFixture({ allowed: false });
  assert.match((await actions.registerOrganization({}, form)).error, /15 นาที/);
  assert.equal(calls.organizations.length, 0);
  assert.equal(calls.sessions.length, 0);
});

test("legacy initial setup still requires its production token and an empty database", async () => {
  const { actions, calls, form } = registrationFixture({ setupToken: "test-setup-token" });
  assert.match((await actions.createInitialOrganization({}, form)).error, /รหัสตั้งค่า/);
  form.set("setupToken", "test-setup-token");
  assert.match((await actions.createInitialOrganization({}, form)).error, /ระบบได้รับการตั้งค่าแล้ว/);
  assert.equal(calls.organizations.length, 0);
});
