const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { enqueueTableSessionQr } = require("../src/lib/print-service.ts");
const { renderEscPos } = require("../print-agent/lib/escpos.cjs");

function fixture({ image = true, dialog = false, pending = false, result = { success: "queued", printQueued: 1 } } = {}) {
  const calls = [], transitions = [], feedback = [];
  let stateIndex = 0, transitionIndex = 0;
  const states = {
    3: dialog ? { sessionId: "session", tableId: "table", tableName: "A1", image: "data:image/png;base64,test" } : null,
    4: image ? { session: { image: "data:image/png;base64,test" } } : {},
  };
  const react = {
    ...require("react"),
    useState(initial) {
      const index = stateIndex++;
      const value = index in states ? states[index] : typeof initial === "function" ? initial() : initial;
      return [value, (next) => { if (index === 5) feedback.push(next); }];
    },
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useEffect: () => {},
    useTransition: () => [transitionIndex++ === 2 && pending, (fn) => transitions.push(fn())],
  };
  const mocks = {
    react,
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "next/image": { default: "img" },
    "next/link": { default: "a" },
    "@/components/counter-billing-controls": { CounterBillingControls: () => null },
    "@/app/pos/actions": { reprintCounterTableQr: async (input) => { calls.push(input); return result; } },
  };
  const source = ts.transpileModule(readFileSync(resolve(__dirname, "../src/components/counter-pos-live-client.tsx"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  // No window is supplied: an accidental browser-print call fails this test.
  vm.runInNewContext(source, { exports, require: (name) => name in mocks ? mocks[name] : require(name) });
  const tree = exports.CounterPosLiveClient({
    branchId: "branch", branchName: "Branch", organizationName: "Shop", pendingServiceRequests: 0,
    paymentMethods: [], hasOpenCashShift: false, canManagePayments: false, canManageServiceRequests: false,
    tables: [{ id: "table", name: "A1", code: "A1", capacity: 4, status: "กำลังสั่ง", sessionId: "session", hasOpenSession: true, totalSatang: 0, orderLines: [], bills: [] }],
  });
  const buttons = [];
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    if (node.type === "button") buttons.push(node);
    walk(node.props?.children);
  }
  walk(tree);
  return { buttons, calls, transitions, feedback };
}

for (const image of [true, false]) {
  test(`QR button sends to the shop agent with preview=${image}`, async () => {
    const f = fixture({ image });
    const button = f.buttons.find((b) => b.props.children === "พิมพ์ QR");
    assert.ok(button);
    button.props.onClick();
    await Promise.all(f.transitions);
    assert.equal(JSON.stringify(f.calls), JSON.stringify([{ branchId: "branch", tableId: "table", sessionId: "session" }]));
    assert.equal(f.feedback.at(-1).tone, "success");
  });
}

test("QR dialog primary action prints through agent; browser printing is explicitly secondary", async () => {
  const f = fixture({ dialog: true });
  const primary = f.buttons.find((b) => b.props.children === "พิมพ์ QR");
  assert.equal(primary.props.className, "primary-button");
  assert.equal(f.buttons.find((b) => b.props.children === "พิมพ์ผ่านเบราว์เซอร์").props.className, "secondary-button");
  primary.props.onClick();
  await Promise.all(f.transitions);
  assert.equal(f.calls.length, 1);
});

test("print actions are disabled while a request is pending", () => {
  const f = fixture({ pending: true, dialog: true });
  const buttons = f.buttons.filter((b) => b.props.children === "กำลังส่งพิมพ์…");
  assert.equal(buttons.length, 2);
  assert.ok(buttons.every((b) => b.props.disabled));
});

test("missing routing is shown as an error, not reported as printed", async () => {
  const f = fixture({ result: { error: "ยังไม่ได้ตั้งเส้นทางพิมพ์ QR" } });
  f.buttons.find((b) => b.props.children === "พิมพ์ QR").props.onClick();
  await Promise.all(f.transitions);
  assert.equal(f.feedback.at(-1).tone, "error");
  assert.equal(f.feedback.at(-1).message, "ยังไม่ได้ตั้งเส้นทางพิมพ์ QR");
});

test("QR routing creates an agent-readable job for the selected branch and session", async () => {
  let jobs;
  const tx = {
    printRoutingRule: { findMany: async ({ where }) => {
      assert.equal(where.branchId, "branch");
      assert.equal(where.documentType, "TABLE_QR");
      assert.equal(where.isActive, true);
      assert.equal(where.printer.isActive, true);
      return [{ printerId: "printer", copies: 1 }];
    } },
    printJob: { createMany: async ({ data }) => { jobs = data; return { count: data.length }; } },
  };
  assert.equal(await enqueueTableSessionQr(tx, {
    branchId: "branch", sessionId: "session", tableName: "A1", branchName: "Branch", organizationName: "Shop",
    url: "https://example.test/q?session=test", createdAt: new Date("2026-10-19T00:00:00Z"), reprintId: "click",
  }), 1);
  assert.equal(jobs[0].printerId, "printer");
  assert.equal(jobs[0].idempotencyKey, "table-qr:session:reprint:click:printer:printer");
  const bytes = renderEscPos(jobs[0].document, { codePage: "UTF-8", paperWidth: 80 });
  assert.ok(bytes.includes(Buffer.from("https://example.test/q?session=test")));
  assert.ok(bytes.includes(Buffer.from([0x1d, 0x28, 0x6b])));
});
