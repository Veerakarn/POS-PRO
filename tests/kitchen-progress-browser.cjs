// Isolated browser fixture: no application database, real users, or printers.
// node tests/kitchen-progress-browser.cjs [directory containing playwright]
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { dirname, join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { createServer } = require("node:http");
const ts = require("typescript");
const { chromium } = require(require.resolve("playwright", { paths: [process.argv[2] ?? process.cwd()] }));

function compile(file) {
  return 'const React = require("react");\n' + ts.transpileModule(readFileSync(resolve(__dirname, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
}

const modules = {
  react: readFileSync(join(dirname(require.resolve("react")), "cjs/react.development.js"), "utf8"),
  "react-dom": readFileSync(join(dirname(require.resolve("react-dom")), "cjs/react-dom.development.js"), "utf8"),
  "react-dom/client": readFileSync(join(dirname(require.resolve("react-dom")), "cjs/react-dom-client.development.js"), "utf8"),
  scheduler: readFileSync(join(dirname(require.resolve("scheduler")), "cjs/scheduler.development.js"), "utf8"),
  "next/navigation": 'const router = { refresh: () => window.refreshFixture() }; exports.useRouter = () => router;',
  "next/link": 'exports.default = ({children, ...props}) => require("react").createElement("a", props, children);',
  "@/lib/order-progress": compile("../src/lib/order-progress.ts"),
  kitchen: compile("../src/components/kitchen-display-client.tsx"),
  customer: compile("../src/components/customer-order-progress.tsx"),
  "@/app/kitchen/actions": `
    exports.updateKitchenOrder = input => fetch('/action', { method: 'POST', body: JSON.stringify(input) }).then(r => r.json());
    exports.setKitchenTracking = input => fetch('/toggle', { method: 'POST', body: JSON.stringify(input) }).then(r => r.json());
  `,
  "@/app/q/status-actions": `exports.getQrOrderStatus = () => fetch('/progress').then(r => r.json());`,
};

const bundle = `
  const factories = {${Object.entries(modules).map(([id, source]) => `${JSON.stringify(id)}: function(module, exports, require, process) {\n${source}\n}`).join(",\n")}};
  const instances = {};
  function require(id) {
    if (!instances[id]) {
      const module = instances[id] = { exports: {} };
      factories[id](module, module.exports, require, { env: { NODE_ENV: 'development' } });
    }
    return instances[id].exports;
  }
  const React = require('react');
  const root = require('react-dom/client').createRoot(document.getElementById('root'));
  const Kitchen = require('kitchen').KitchenDisplayClient;
  const Customer = require('customer').CustomerOrderProgress;
  window.refreshFixture = async () => {
    if (location.pathname === '/customer') {
      root.render(React.createElement(Customer, { context: { branchSlug:'shop', branchCode:'A', tableCode:'B4', qrSecret:'secret', sessionNonce:'nonce' }, refreshKey:'initial' }));
    } else {
      const data = await fetch('/state').then(r => r.json());
      root.render(React.createElement(Kitchen, data));
    }
  };
  window.refreshFixture();
`;

async function main() {
  let enabled = true;
  const lines = [
    { id: "a", orderId: "order1", name: "กุ้งแช่น้ำปลา", quantity: 2, station: "kitchen", note: null },
    { id: "b", orderId: "order1", name: "ต้มยำ", quantity: 1, station: "kitchen", note: "เผ็ดน้อย" },
    { id: "c", orderId: "order1", name: "น้ำเปล่า", quantity: 1, station: "bar", note: null },
  ].map(line => ({ ...line, status: "NEW", tableName: "B4", tableCode: "B4", orderNumber: 20, createdAtLabel: "15 นาที" }));
  const server = createServer(async (req, res) => {
    if (req.url === "/fixture.js") { res.setHeader("Content-Type", "application/javascript; charset=utf-8"); res.end(bundle); return; }
    if (req.url === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(readFileSync(resolve(__dirname, "../src/app/globals.css"))); return; }
    if (["/action", "/toggle", "/state", "/progress"].includes(req.url)) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      let body = "";
      for await (const chunk of req) body += chunk;
      if (req.url === "/toggle") { enabled = JSON.parse(body).enabled; res.end(JSON.stringify({ success: "บันทึกแล้ว" })); return; }
      if (req.url === "/action") {
        const input = JSON.parse(body);
        for (const line of lines) if (enabled && line.orderId === input.orderId && line.station === input.stationId) line.status = input.status;
        res.end(JSON.stringify({ success: "บันทึกแล้ว" })); return;
      }
      if (req.url === "/progress") {
        res.end(JSON.stringify({ enabled, orders: enabled ? [{ id: "order1", orderNumber: 20, items: lines }] : [] })); return;
      }
      res.end(JSON.stringify({ branchId: "branch", branchName: "สาขาทดสอบ", trackingEnabled: enabled, unroutedTickets: [], stations:
        [{ id: "kitchen", name: "ครัว", kind: "ครัว" }, { id: "bar", name: "บาร์", kind: "บาร์" }].map(station => ({ ...station, tickets: lines.filter(line => line.station === station.id && line.status !== "SERVED" && line.status !== "CANCELLED") })) })); return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end('<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const kitchen = await browser.newPage({ viewport: { width: 1180, height: 820 } });
    const customer = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    kitchen.on("pageerror", error => errors.push(error.message));
    customer.on("pageerror", error => errors.push(error.message));
    const url = `http://127.0.0.1:${server.address().port}`;
    await kitchen.goto(url);
    await customer.goto(`${url}/customer`);
    const board = kitchen.locator(".kitchen-station").first();
    await board.locator(".kitchen-ticket").waitFor();
    assert.equal(await board.locator(".kitchen-ticket").count(), 1);
    assert.equal(await board.locator(".kitchen-order-lines li").count(), 2);
    await kitchen.screenshot({ path: join(tmpdir(), "pospro-kitchen-progress.png"), fullPage: true });
    await board.getByRole("button", { name: "รับออเดอร์", exact: true }).click();
    await board.getByRole("button", { name: "เสิร์ฟแล้ว", exact: true }).waitFor();
    assert.equal(await board.locator(".kitchen-ticket").count(), 1);
    await customer.getByText("รับออเดอร์แล้ว", { exact: true }).first().waitFor({ timeout: 15000 });
    kitchen.once("dialog", dialog => dialog.dismiss());
    await board.getByRole("button", { name: "เสิร์ฟแล้ว", exact: true }).click();
    assert.equal(await board.locator(".kitchen-ticket").count(), 1);
    kitchen.once("dialog", dialog => dialog.accept());
    await board.getByRole("button", { name: "เสิร์ฟแล้ว", exact: true }).click();
    await board.getByText("ไม่มีรายการค้างในจุดผลิตนี้").waitFor();
    await customer.getByText("เสิร์ฟแล้ว", { exact: true }).first().waitFor({ timeout: 15000 });
    assert.equal(await customer.getByText("เสิร์ฟแล้ว", { exact: true }).count(), 2);
    assert.equal(await customer.getByText("รอร้านรับออเดอร์", { exact: true }).count(), 1);
    await customer.screenshot({ path: join(tmpdir(), "pospro-customer-progress.png"), fullPage: true });
    await kitchen.getByRole("switch").click();
    await kitchen.getByRole("switch", { checked: false }).waitFor();
    assert.equal(await board.locator(".kitchen-ticket").count(), 0);
    assert.equal(await kitchen.getByRole("button", { name: /^(รับออเดอร์|เสิร์ฟแล้ว)$/ }).count(), 0);
    await customer.locator(".customer-order-progress").waitFor({ state: "hidden", timeout: 15000 });
    await kitchen.reload();
    await kitchen.getByRole("switch", { checked: false }).waitFor();
    await kitchen.getByRole("switch").click();
    await kitchen.getByRole("switch", { checked: true }).waitFor();
    assert.equal(await board.locator(".kitchen-ticket").count(), 0);
    await customer.locator(".customer-order-progress").waitFor({ timeout: 15000 });
    assert.equal(await customer.getByText("เสิร์ฟแล้ว", { exact: true }).count(), 2);
    await kitchen.setViewportSize({ width: 390, height: 844 });
    assert.equal(await kitchen.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await customer.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log("PASS: grouped tickets, receive/serve, customer polling, tracking toggle, reload and mobile layout.");
    console.log(`Screenshots: ${join(tmpdir(), "pospro-kitchen-progress.png")} and ${join(tmpdir(), "pospro-customer-progress.png")}`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
