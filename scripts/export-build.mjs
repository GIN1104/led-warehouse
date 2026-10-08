import { spawnSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";

// Файл не в git: без этого шага Pages отдаёт 404, и sql.js пишет «fetching of the wasm failed».
const copied = spawnSync("node", ["scripts/copy-sql-wasm.mjs"], { stdio: "inherit" });
if ((copied.status ?? 1) !== 0) process.exit(copied.status ?? 1);

const api = "src/app/api";
const hidden = ".api-hidden";
let moved = false;

if (existsSync(api)) {
  renameSync(api, hidden);
  moved = true;
}

let status = 1;
try {
  const result = spawnSync("npx", ["next", "build"], {
    stdio: "inherit",
    env: { ...process.env, STATIC_EXPORT: "1", NEXT_PUBLIC_SHARED: "" },
  });
  status = result.status ?? 1;
} finally {
  if (moved && existsSync(hidden)) renameSync(hidden, api);
}
process.exit(status);
