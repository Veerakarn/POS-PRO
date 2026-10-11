const { test } = require("node:test");
const assert = require("node:assert/strict");

const { createRateLimitKey, extractClientIp } = require("../src/lib/rate-limit-key.ts");

test("rate-limit keys combine action, resource and request identity", () => {
  const base = createRateLimitKey({ action: "qr-order", resourceIdentity: "table-a" });
  const composite = createRateLimitKey({
    action: "qr-order",
    resourceIdentity: "table-a",
    requestIdentity: "203.0.113.10",
  });

  assert.match(base, /^[a-f0-9]{64}$/);
  assert.notEqual(base, composite);
  assert.notEqual(
    composite,
    createRateLimitKey({ action: "qr-order", resourceIdentity: "table-a", requestIdentity: "203.0.113.11" }),
  );
  assert.notEqual(
    composite,
    createRateLimitKey({ action: "qr-order", resourceIdentity: "table-b", requestIdentity: "203.0.113.10" }),
  );
  assert.equal(
    composite,
    createRateLimitKey({ action: " QR-ORDER ", resourceIdentity: " TABLE-A ", requestIdentity: " 203.0.113.10 " }),
  );
});

test("rate-limit key inputs reject empty and oversized identities", () => {
  assert.throws(() => createRateLimitKey({ action: "", resourceIdentity: "table-a" }), /action/i);
  assert.throws(() => createRateLimitKey({ action: "qr-order", resourceIdentity: "x".repeat(257) }), /resource/i);
  assert.throws(
    () => createRateLimitKey({ action: "qr-order", resourceIdentity: "table-a", requestIdentity: "x".repeat(129) }),
    /request/i,
  );
});

test("client IP extraction accepts forwarded IPv4 and IPv6 but rejects arbitrary headers", () => {
  assert.equal(extractClientIp("203.0.113.10, 10.0.0.1"), "203.0.113.10");
  assert.equal(extractClientIp("not-an-ip", "[2001:db8::1]"), "2001:db8::1");
  assert.equal(extractClientIp("attacker-controlled-value"), undefined);
});
