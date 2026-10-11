/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { renderEscPos } = require("./lib/escpos.cjs");
const { dispatchPrint } = require("./lib/print.cjs");

function loadLocalEnv() {
  const file = resolve(__dirname, ".env");
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadLocalEnv();
const serverUrl = (process.env.POSPRO_SERVER_URL || "").replace(/\/$/, "");
const token = process.env.POSPRO_AGENT_TOKEN || "";
const pollInterval = Math.max(500, Math.min(Number(process.env.POSPRO_POLL_INTERVAL_MS) || 2_000, 60_000));
const dryRunDir = process.env.POSPRO_DRY_RUN_DIR || "";
const once = process.argv.includes("--once");
const version = require("./package.json").version;

if (!/^https?:\/\//.test(serverUrl) || token.length < 32) {
  console.error("ตั้งค่า POSPRO_SERVER_URL และ POSPRO_AGENT_TOKEN ใน print-agent/.env ก่อนเริ่มใช้งาน");
  process.exit(1);
}

async function api(path, body) {
  const response = await fetch(`${serverUrl}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`API ${response.status}: ${data.error || "unknown"}`);
  return data;
}

async function poll() {
  const { job } = await api("/api/print-agent/pull", { version });
  if (!job) return false;
  console.log(`[${new Date().toISOString()}] รับงาน ${job.id} -> ${job.printer.name}`);
  try {
    const bytes = renderEscPos(job.document, job.printer);
    const output = await dispatchPrint(job.printer, bytes, dryRunDir);
    await api(`/api/print-agent/jobs/${encodeURIComponent(job.id)}/complete`, { status: "PRINTED" });
    console.log(`พิมพ์งาน ${job.id} สำเร็จ${output ? ` (${output})` : ""}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`พิมพ์งาน ${job.id} ไม่สำเร็จ: ${message}`);
    await api(`/api/print-agent/jobs/${encodeURIComponent(job.id)}/complete`, { status: "FAILED", error: message }).catch((reportError) => console.error(`รายงานผลล้มเหลว: ${reportError.message}`));
  }
  return true;
}

async function main() {
  console.log(`POS@PRO Print Agent v${version}${dryRunDir ? ` · dry-run ${dryRunDir}` : ""}`);
  do {
    try {
      const hadJob = await poll();
      if (once) break;
      if (!hadJob) await new Promise((resolvePromise) => setTimeout(resolvePromise, pollInterval));
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ${error instanceof Error ? error.message : error}`);
      if (once) process.exitCode = 1;
      else await new Promise((resolvePromise) => setTimeout(resolvePromise, Math.max(pollInterval, 5_000)));
    }
  } while (!once);
}

main();
