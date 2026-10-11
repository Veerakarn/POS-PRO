// Prisma CLI does not automatically load the Next.js .env.local file.
require("@next/env").loadEnvConfig(process.cwd());
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const result = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), ...process.argv.slice(2)], {
  stdio: "inherit", env: process.env,
});
process.exit(result.status ?? 1);
