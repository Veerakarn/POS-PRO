/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const net = require("node:net");
const { mkdir, writeFile, unlink } = require("node:fs/promises");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

function printNetwork(endpoint, data) {
  const separator = endpoint.lastIndexOf(":");
  const host = endpoint.slice(0, separator);
  const port = Number(endpoint.slice(separator + 1));
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Network endpoint ต้องเป็น host:port");
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(10_000);
    socket.once("connect", () => socket.end(data));
    socket.once("timeout", () => socket.destroy(new Error("เชื่อมต่อเครื่องพิมพ์หมดเวลา")));
    socket.once("error", reject);
    socket.once("close", (hadError) => { if (!hadError) resolve(); });
  });
}

function runPowerShell(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...args], { windowsHide: true });
    let error = "";
    child.stderr.on("data", (chunk) => { error += chunk.toString(); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(error.trim() || `PowerShell exited ${code}`)));
  });
}

async function printWindows(queueName, data) {
  if (!queueName || queueName.length > 200) throw new Error("ชื่อ Windows Printer Queue ไม่ถูกต้อง");
  const file = join(tmpdir(), `pospro-${randomUUID()}.bin`);
  await writeFile(file, data);
  try {
    await runPowerShell(join(__dirname, "..", "raw-print.ps1"), ["-PrinterName", queueName, "-FilePath", file]);
  } finally {
    await unlink(file).catch(() => {});
  }
}

async function dispatchPrint(printer, data, dryRunDir) {
  if (dryRunDir) {
    await mkdir(dryRunDir, { recursive: true });
    const file = join(dryRunDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.bin`);
    await writeFile(file, data);
    return file;
  }
  if (printer.connection === "NETWORK") return printNetwork(printer.endpoint, data);
  if (printer.connection === "WINDOWS") return printWindows(printer.endpoint, data);
  throw new Error(`ไม่รองรับการเชื่อมต่อ ${printer.connection}`);
}

module.exports = { dispatchPrint };
