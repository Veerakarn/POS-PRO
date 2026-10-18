const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(relativePath, mocks = {}) {
  const source = ts.transpileModule(readFileSync(resolve(__dirname, relativePath), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require: (name) => name in mocks ? mocks[name] : require(name),
    process: { env: { NODE_ENV: "production", VERCEL_ENV: "production", TAX_PROFILE_TEST_MODE: "false" } },
  });
  return exports;
}

const rules = load("../src/lib/commerce-rules.ts");

function fixture({ authorized = true } = {}) {
  const calls = { saved: [], invoices: [], counters: [], revalidated: [] };
  let stored;
  const taxProfile = {
    upsert: async ({ create, update }) => {
      stored = stored ? { ...stored, ...update } : { id: "profile-test", nextDocumentNumber: 1, ...create };
      calls.saved.push(stored);
      return stored;
    },
    findUnique: async () => stored,
    update: async (input) => { calls.counters.push(input); return stored; },
  };
  const tx = {
    taxProfile,
    $queryRaw: async () => [],
    bill: { findFirst: async () => ({ id: "bill-test", billNumber: "TEST-1", subtotalSatang: 10000, discountSatang: 0, taxSatang: 700, taxIncluded: false, taxRateBps: 700, totalSatang: 10700, lines: [] }) },
    taxInvoice: {
      findUnique: async () => null,
      create: async ({ data }) => { calls.invoices.push(data); return { id: "invoice-test", invoiceNumber: data.invoiceNumber }; },
    },
  };
  const actions = load("../src/app/settings/commerce/actions.ts", {
    "next/cache": { revalidatePath: (path) => calls.revalidated.push(path) },
    "@/lib/auth": { requirePermission: async (permission, branchId) => {
      assert.equal(permission, "payment.manage");
      assert.equal(branchId, "branch-test");
      if (!authorized) throw new Error("Forbidden");
      return { id: "user-test", organizationId: "shop-test" };
    } },
    "@/lib/db": { db: { taxProfile, $transaction: async (callback) => callback(tx) } },
    "@/lib/commerce-rules": rules,
  });
  const form = new FormData();
  Object.entries({ branchId: "branch-test", legalName: "เกจู้", taxpayerId: "1233139748188", address: "12/222 ตรหกดหอย", branchNumber: "23241", documentPrefix: "TAX", vatRate: "7", isVatRegistered: "on", taxIncluded: "on" })
    .forEach(([key, value]) => form.set(key, value));
  const invoiceForm = new FormData();
  Object.entries({ billId: "bill-test", branchId: "branch-test", buyerName: "ผู้ซื้อทดสอบ", buyerAddress: "ที่อยู่ผู้ซื้อทดสอบ" })
    .forEach(([key, value]) => invoiceForm.set(key, value));
  return { actions, calls, form, invoiceForm };
}

for (const taxpayerId of ["1233139748188", "ทดสอบ-TAX-01", ""]) {
  test(`production saves and reloads temporary taxpayer ID ${JSON.stringify(taxpayerId)} without configuration`, async () => {
    const { actions, calls, form } = fixture();
    form.set("taxpayerId", taxpayerId);
    const result = await actions.saveTaxProfile({}, form);
    assert.equal(result.error, undefined);
    assert.match(result.success, /บันทึกข้อมูลชั่วคราวแล้ว/);
    assert.equal(calls.saved[0].taxpayerId, taxpayerId);
    assert.equal(calls.saved[0].organizationId, "shop-test");
    assert.ok(calls.revalidated.includes("/settings/tax"));
    const { TaxProfileForm } = load("../src/components/commerce-forms.tsx", {
      "@/app/settings/commerce/actions": actions,
    });
    const html = renderToStaticMarkup(React.createElement(TaxProfileForm, {
      branchId: "branch-test", defaults: { ...calls.saved[0], vatRatePercent: 7 },
    }));
    const input = html.match(/<input\b[^>]*name="taxpayerId"[^>]*>/)?.[0];
    assert.ok(input);
    assert.ok(input.includes(`value="${taxpayerId}"`));
    assert.match(input, /maxLength="50"/i);
    assert.doesNotMatch(input, /\b(?:pattern|required)=/);
  });
}

test("a saved temporary ID cannot issue an invoice or consume its document number", async () => {
  const { actions, calls, form, invoiceForm } = fixture();
  await actions.saveTaxProfile({}, form);
  assert.match((await actions.issueTaxInvoice({}, invoiceForm)).error, /ข้อมูลชั่วคราว/);
  assert.equal(calls.invoices.length, 0);
  assert.equal(calls.counters.length, 0);
});

test("correcting the saved ID enables invoicing using the corrected seller snapshot", async () => {
  const { actions, calls, form, invoiceForm } = fixture();
  await actions.saveTaxProfile({}, form);
  form.set("taxpayerId", "1234567890121");
  assert.ok(rules.isThaiTaxId(form.get("taxpayerId")));
  assert.equal((await actions.saveTaxProfile({}, form)).error, undefined);
  assert.equal((await actions.issueTaxInvoice({}, invoiceForm)).error, undefined);
  assert.equal(calls.counters.length, 1);
  assert.equal(calls.invoices[0].sellerSnapshot.taxpayerId, "1234567890121");
});

test("permission checks and input length limits still prevent writes", async () => {
  const denied = fixture({ authorized: false });
  await assert.rejects(denied.actions.saveTaxProfile({}, denied.form), /Forbidden/);
  assert.equal(denied.calls.saved.length, 0);
  const { actions, calls, form } = fixture();
  form.set("taxpayerId", "x".repeat(51));
  assert.match((await actions.saveTaxProfile({}, form)).error, /50/);
  assert.equal(calls.saved.length, 0);
});
