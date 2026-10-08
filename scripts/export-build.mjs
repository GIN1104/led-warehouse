import { spawnSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";

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
