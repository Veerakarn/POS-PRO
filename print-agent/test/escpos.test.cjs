/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { renderEscPos } = require("../lib/escpos.cjs");

test("renders order ticket with item, note, copies and cut commands", () => {
  const bytes = renderEscPos({ version: 1, type: "ORDER_TICKET", title: "Kitchen", branchName: "Branch", stationName: "Hot", orderNumber: 12, tableName: "A1", source: "QR", createdAt: "2026-10-07T00:00:00.000Z", copies: 2, lines: [{ quantity: 2, name: "Rice", note: "No chili" }] }, { paperWidth: 80, codePage: "UTF-8" });
  const text = bytes.toString("utf8");
  assert.match(text, /2 x Rice/);
  assert.match(text, /No chili/);
  assert.equal(bytes.filter((value, index) => value === 0x1d && bytes[index + 1] === 0x56).length, 2);
});

test("rejects unknown document formats", () => {
  assert.throws(() => renderEscPos({ version: 1, type: "UNKNOWN", copies: 1 }, { paperWidth: 58, codePage: "UTF-8" }), /ไม่รองรับ/);
});

test("renders a session QR with ESC/POS QR commands", () => {
  const bytes = renderEscPos({ version: 1, type: "TABLE_QR", title: "QR โต๊ะ", organizationName: "Restaurant", branchName: "Branch", tableName: "A1", url: "https://example.com/q?session=abc", createdAt: "2026-10-14T00:00:00.000Z", copies: 1 }, { paperWidth: 58, codePage: "UTF-8" });
  assert.match(bytes.toString("utf8"), /Restaurant/);
  assert.match(bytes.toString("utf8"), /สาขา Branch/);
  assert.match(bytes.toString("utf8"), /โต๊ะ A1/);
  assert.match(bytes.toString("utf8"), /สแกนเพื่อสั่งอาหาร/);
  assert.ok(bytes.includes(Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30])));
});
