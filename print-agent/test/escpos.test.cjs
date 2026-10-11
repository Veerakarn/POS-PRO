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
