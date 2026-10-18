const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");

const source = readFileSync(resolve(__dirname, "../public/sw.js"), "utf8");

function workerFixture(cacheOverrides = {}) {
  const handlers = {};
  const deleted = [];
  let claimed = false;
  vm.runInNewContext(source, {
    URL,
    self: {
      location: { origin: "https://pos.example" },
      addEventListener: (name, callback) => { handlers[name] = callback; },
      clients: { claim: async () => { claimed = true; } },
    },
    fetch: async () => new Response("asset contents"),
    caches: {
      match: async () => undefined,
      keys: async () => ["pospro-shell-v1", "pospro-shell-v2", "pospro-shell-v3", "other-app-cache"],
      delete: async (name) => { deleted.push(name); return true; },
      ...cacheOverrides,
    },
  });
  return { handlers, deleted, claimed: () => claimed };
}

function fetchAsset(handlers) {
  let response;
  const background = [];
  handlers.fetch({
    request: new Request("https://pos.example/_next/static/test.js"),
    respondWith: (promise) => { response = promise; },
    waitUntil: (promise) => background.push(promise),
  });
  return { response, background };
}

test("cache receives a clone even when the browser consumes the response before cache opens", async () => {
  let openCache;
  let cachedBody;
  const gate = new Promise((resolve) => { openCache = resolve; });
  const { handlers } = workerFixture({ open: () => gate });
  const { response, background } = fetchAsset(handlers);
  const browserResponse = await response;
  assert.equal(await browserResponse.text(), "asset contents");
  assert.equal(browserResponse.bodyUsed, true);
  openCache({ put: async (_request, copy) => { cachedBody = await copy.text(); } });
  await Promise.all(background);
  assert.equal(cachedBody, "asset contents");
});

test("full cache storage does not break the response or leave an unhandled rejection", async () => {
  const { handlers } = workerFixture({ open: async () => ({ put: async () => { throw new Error("Quota exceeded"); } }) });
  const { response, background } = fetchAsset(handlers);
  assert.equal(await (await response).text(), "asset contents");
  await Promise.all(background);
});

test("activation removes only old POS caches and waits to take control", async () => {
  const { handlers, deleted, claimed } = workerFixture();
  const background = [];
  handlers.activate({ waitUntil: (promise) => background.push(promise) });
  await Promise.all(background);
  assert.deepEqual(deleted, ["pospro-shell-v1", "pospro-shell-v2"]);
  assert.equal(claimed(), true);
});
