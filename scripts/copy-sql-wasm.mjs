import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const source = require.resolve("sql.js/dist/sql-wasm.wasm");
copyFileSync(source, new URL("../public/sql-wasm.wasm", import.meta.url));
