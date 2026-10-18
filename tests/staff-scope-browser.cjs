// Run with: node tests/staff-scope-browser.cjs [directory containing playwright]
// Uses an isolated browser and in-memory fixtures; no application database is accessed.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { dirname, join, resolve } = require("node:path");
const { createServer } = require("node:http");
const ts = require("typescript");
const { chromium } = require(require.resolve("playwright", { paths: [process.argv[2] ?? process.cwd()] }));

function compile(file) {
  return ts.transpileModule(readFileSync(resolve(__dirname, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
}

const modules = {
  react: readFileSync(join(dirname(require.resolve("react")), "cjs/react.development.js"), "utf8"),
  "react-dom": readFileSync(join(dirname(require.resolve("react-dom")), "cjs/react-dom.development.js"), "utf8"),
  "react-dom/client": readFileSync(join(dirname(require.resolve("react-dom")), "cjs/react-dom-client.development.js"), "utf8"),
  scheduler: readFileSync(join(dirname(require.resolve("scheduler")), "cjs/scheduler.development.js"), "utf8"),
  "@/lib/permissions": compile("../src/lib/permissions.ts"),
  staff: 'const React = require("react");\n' + compile("../src/components/staff-management.tsx"),
  "@/app/settings/staff/actions": `
    for (const name of ["createStaff", "createRole", "updateRole", "removeRoleAssignment", "resetStaffPin", "toggleRoleStatus", "toggleStaffStatus", "updateStaffProfile"]) {
      exports[name] = async () => ({ success: "บันทึกแล้ว" });
    }
    exports.addRoleAssignment = async (_, data) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const branchId = data.get("scope") === "branch" ? data.get("branchId") : null;
      localStorage.setItem("fixture-branch", JSON.stringify(branchId));
      window.renderStaffFixture(branchId);
      return { success: "บันทึกขอบเขตแล้ว" };
    };
  `,
};

const bundle = `
  const factories = {${Object.entries(modules).map(([id, source]) => `${JSON.stringify(id)}: function(module, exports, require, process) {\n${source}\n}`).join(",\n")}};
  const instances = {};
  function require(id) {
    if (!instances[id]) {
      const module = instances[id] = { exports: {} };
      factories[id](module, module.exports, require, { env: { NODE_ENV: "development" } });
    }
    return instances[id].exports;
  }
  const React = require("react");
  const root = require("react-dom/client").createRoot(document.getElementById("root"));
  const { StaffManagement } = require("staff");
  const branches = [{ id: "a", name: "Branch A", code: "A" }, { id: "b", name: "Branch B", code: "B" }];
  const roles = ["first-role", "manager"].map(id => ({ id, name: id, description: null, permissions: ["pos.use", "user.manage"], isActive: true, isSystem: false, assignmentCount: 1 }));
  window.renderStaffFixture = branchId => root.render(React.createElement(StaffManagement, {
    organizationName: "Test shop", currentUserId: "owner", branches, roles,
    staff: [{ id: "staff", displayName: "Test staff", email: "staff@example.test", isActive: true, mustChangePin: false,
      assignments: [{ id: "assignment", roleId: "manager", roleName: "manager", roleIsSystem: false, branchId, branchName: branches.find(b => b.id === branchId)?.name ?? null }],
    }],
  }));
  window.renderStaffFixture(JSON.parse(localStorage.getItem("fixture-branch") ?? "null"));
`;

async function main() {
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", request.url === "/fixture.js" ? "application/javascript; charset=utf-8" : "text/html; charset=utf-8");
    response.end(request.url === "/fixture.js" ? bundle : '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const details = page.locator(".staff-card details").nth(1);
    await details.locator("summary").click();
    assert.equal(await page.locator("#assignment-staff-scope-organization").isChecked(), true);
    await page.locator("#assignment-staff-scope-branch").check();
    await page.locator("#assignment-staff-branch").selectOption("b");
    await details.getByRole("button", { name: "บันทึกขอบเขตบทบาท" }).click();
    await page.getByText("บันทึกขอบเขตแล้ว", { exact: true }).waitFor();
    assert.equal(await page.locator("#assignment-staff-scope-branch").isChecked(), true);
    assert.equal(await page.locator("#assignment-staff-branch").inputValue(), "b");
    await page.reload();
    await page.locator(".staff-card details").nth(1).locator("summary").click();
    assert.equal(await page.locator("#assignment-staff-scope-branch").isChecked(), true);
    assert.equal(await page.locator("#assignment-staff-branch").inputValue(), "b");
    await page.locator("#new-staff-branch").selectOption("b");
    await page.locator("#new-staff-role").selectOption("manager");
    assert.equal(await page.locator("#new-staff-scope-branch").isChecked(), true);
    assert.equal(await page.locator("#new-staff-branch").inputValue(), "b");
    await page.locator("#new-staff-scope-organization").check();
    await page.locator("#new-staff-scope-branch").check();
    assert.equal(await page.locator("#new-staff-branch").inputValue(), "b");
    assert.deepEqual(errors, []);
    console.log("PASS: branch selection survives submission, reload, role changes, and scope toggling in a real browser.");
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
