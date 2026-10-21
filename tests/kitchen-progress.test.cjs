const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { groupKitchenOrders } = require("../src/lib/order-progress.ts");

function load(file, mocks) {
  const source = ts.transpileModule(readFileSync(resolve(__dirname, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: (name) => name in mocks ? mocks[name] : require(name) });
  return exports;
}

function fixture() {
  const branch = { id: "branch", organizationId: "shop", orderStatusTrackingEnabled: true };
  const lines = [
    { id: "food1", orderId: "order", station: "kitchen", status: "NEW" },
    { id: "food2", orderId: "order", station: "kitchen", status: "NEW" },
    { id: "drink", orderId: "order", station: "bar", status: "NEW" },
    { id: "unrouted", orderId: "order", station: null, status: "NEW" },
    { id: "cancelled", orderId: "order", station: "kitchen", status: "CANCELLED" },
    { id: "other", orderId: "other-order", station: "kitchen", status: "NEW" },
  ];
  const audits = [], permissions = [];
  const state = { open: true, authorized: true };
  const tx = {
    branch: {
      findFirst: async ({ where }) => where.id === branch.id && where.organizationId === branch.organizationId ? branch : null,
      updateMany: async ({ where, data }) => {
        if (where.id !== branch.id || where.organizationId !== branch.organizationId) return { count: 0 };
        Object.assign(branch, data); return { count: 1 };
      },
    },
    orderItem: { updateMany: async ({ where, data }) => {
      assert.equal(where.order.branchId, branch.id);
      assert.equal(where.order.status.not, "CANCELLED");
      assert.equal(where.order.tableSession.status.in.includes("CLOSED"), false);
      const route = where.menuItem.stationRoutes.some ?? where.menuItem.stationRoutes.none;
      assert.equal(route.station.branchId, branch.id);
      assert.equal(route.station.isActive, true);
      const allowed = typeof where.status === "string" ? [where.status] : where.status.in;
      const selected = lines.filter((line) => state.open && line.orderId === where.orderId && allowed.includes(line.status)
        && (where.menuItem.stationRoutes.some ? line.station === route.stationId : line.station === null));
      selected.forEach((line) => { line.status = data.status; });
      return { count: selected.length };
    } },
    auditLog: { create: async ({ data }) => audits.push(data) },
  };
  const actions = load("../src/app/kitchen/actions.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/auth": { requirePermission: async (permission, branchId) => {
      permissions.push([permission, branchId]);
      if (!state.authorized) throw new Error("Forbidden");
      return { id: "staff", organizationId: "shop" };
    } },
    "@/lib/db": { db: { $transaction: async (fn) => fn(tx) } },
  });
  return { branch, lines, audits, actions, state, permissions,
    input: { branchId: "branch", orderId: "order", stationId: "kitchen", status: "ACKNOWLEDGED" } };
}

test("groups a submitted order into one card without merging later rounds or notes", () => {
  const base = { name: "Food", quantity: 1, tableName: "B4", orderNumber: 20, createdAtLabel: "15 นาที", status: "NEW" };
  const groups = groupKitchenOrders([
    { ...base, id: "1", orderId: "a", note: "no spice" },
    { ...base, id: "2", orderId: "a", note: "spicy", quantity: 2 },
    { ...base, id: "3", orderId: "b", note: null },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].lines.length, 2);
  assert.equal(groups[0].lines[1].note, "spicy");
  assert.equal(groups[0].createdAtLabel, "15 นาที");
});

test("receive then serve updates only the chosen order and station", async () => {
  const f = fixture();
  assert.ok((await f.actions.updateKitchenOrder(f.input)).success);
  assert.equal(f.lines[0].status, "ACKNOWLEDGED");
  assert.equal(f.lines[1].status, "ACKNOWLEDGED");
  assert.equal(f.lines[2].status, "NEW");
  assert.equal(f.lines[4].status, "CANCELLED");
  assert.equal(f.lines[5].status, "NEW");
  assert.ok((await f.actions.updateKitchenOrder({ ...f.input, status: "SERVED" })).success);
  assert.equal(f.lines[0].status, "SERVED");
  assert.equal(f.audits.length, 2);
  assert.deepEqual(f.permissions[0], ["kitchen.view", "branch"]);
});

test("cannot serve before receiving or regress a served item on a duplicate click", async () => {
  const f = fixture();
  assert.ok((await f.actions.updateKitchenOrder({ ...f.input, status: "SERVED" })).error);
  await f.actions.updateKitchenOrder(f.input);
  await f.actions.updateKitchenOrder({ ...f.input, status: "SERVED" });
  assert.ok((await f.actions.updateKitchenOrder(f.input)).error);
  assert.equal(f.lines[0].status, "SERVED");
});

test("unrouted orders can be handled without changing routed items", async () => {
  const f = fixture();
  await f.actions.updateKitchenOrder({ ...f.input, stationId: null });
  assert.equal(f.lines[3].status, "ACKNOWLEDGED");
  assert.equal(f.lines[0].status, "NEW");
});

test("disabling tracking persists the switch, blocks updates and preserves existing statuses", async () => {
  const f = fixture();
  assert.ok((await f.actions.setKitchenTracking({ branchId: "branch", enabled: false })).success);
  assert.equal(f.branch.orderStatusTrackingEnabled, false);
  assert.ok((await f.actions.updateKitchenOrder(f.input)).error);
  assert.equal(f.lines[0].status, "NEW");
  await f.actions.setKitchenTracking({ branchId: "branch", enabled: true });
  assert.ok((await f.actions.updateKitchenOrder(f.input)).success);
});

test("closed sessions and another branch cannot be updated", async () => {
  const f = fixture();
  f.state.open = false;
  assert.ok((await f.actions.updateKitchenOrder(f.input)).error);
  assert.ok((await f.actions.updateKitchenOrder({ ...f.input, branchId: "foreign" })).error);
  assert.ok((await f.actions.setKitchenTracking({ branchId: "foreign", enabled: false })).error);
  assert.equal(f.audits.length, 0);
});

test("both mutations enforce branch permission", async () => {
  const f = fixture();
  f.state.authorized = false;
  await assert.rejects(f.actions.updateKitchenOrder(f.input), /Forbidden/);
  await assert.rejects(f.actions.setKitchenTracking({ branchId: "branch", enabled: false }), /Forbidden/);
  assert.equal(f.audits.length, 0);
});

test("invalid status and invalid switch are rejected without changes", async () => {
  const f = fixture();
  assert.ok((await f.actions.updateKitchenOrder({ ...f.input, status: "CANCELLED" })).error);
  assert.ok((await f.actions.setKitchenTracking({ branchId: "branch", enabled: "false" })).error);
  assert.equal(f.audits.length, 0);
});

const qr = { branchSlug: "SHOP", branchCode: "a", tableCode: "b4", qrSecret: "secret", sessionNonce: "nonce" };
function customerFixture({ enabled = true, valid = true } = {}) {
  let queried = false;
  const actions = load("../src/app/q/status-actions.ts", {
    "@/lib/db": { db: { tableSession: { findFirst: async ({ where }) => {
      queried = true;
      assert.equal(where.accessNonce, qr.sessionNonce);
      assert.equal(where.table.qrSecret, qr.qrSecret);
      assert.equal(where.table.code, "B4");
      assert.equal(where.branch.code, "A");
      assert.equal(where.branch.organization.slug, "shop");
      assert.equal(where.status.in.includes("CLOSED"), false);
      return valid ? { branch: { orderStatusTrackingEnabled: enabled }, orders: [{ id: "o", orderNumber: 20, items: [{ id: "i", nameSnapshot: "Food", quantity: 2, status: "SERVED" }] }] } : null;
    } } } },
  });
  return { actions, queried: () => queried };
}

test("customer sees the saved item status only through the active QR session", async () => {
  const f = customerFixture();
  const result = await f.actions.getQrOrderStatus(qr);
  assert.equal(result.enabled, true);
  assert.equal(result.orders[0].items[0].status, "SERVED");
  assert.equal(result.orders[0].items[0].name, "Food");
});

test("disabled tracking returns no customer status or orders", async () => {
  const result = await customerFixture({ enabled: false }).actions.getQrOrderStatus(qr);
  assert.equal(result.enabled, false);
  assert.equal(result.orders.length, 0);
});

test("expired or wrong-table QR cannot read order status", async () => {
  const result = await customerFixture({ valid: false }).actions.getQrOrderStatus(qr);
  assert.ok(result.error);
  assert.equal(result.orders.length, 0);
});

test("malformed customer requests do not query the database", async () => {
  const f = customerFixture();
  assert.ok((await f.actions.getQrOrderStatus({ ...qr, sessionNonce: "" })).error);
  assert.equal(f.queried(), false);
});
