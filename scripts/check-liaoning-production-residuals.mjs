import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const roots = ["src", "dsl", "scripts"];
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json"]);
const forbidden = [/RS-SHANGHAI/i, /(?:P|T|R)-SH-/i];
const allowedFiles = new Set([
  "src/lib/import/liaoning-import-guard.ts",
  "src/lib/import/liaoning-import-guard.test.ts",
  "src/lib/engine/__tests__/liaoning-policy.test.ts",
  "scripts/check-liaoning-production-residuals.mjs",
]);

function walk(path) {
  return readdirSync(path).flatMap((entry) => {
    const full = join(path, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const violations = roots
  .flatMap(walk)
  .filter((file) => extensions.has(extname(file)))
  .filter((file) => !allowedFiles.has(relative(process.cwd(), file)))
  .flatMap((file) => {
    const content = readFileSync(file, "utf8");
    return forbidden
      .filter((pattern) => pattern.test(content))
      .map((pattern) => `${relative(process.cwd(), file)}: ${pattern}`);
  });

if (violations.length > 0) {
  process.stderr.write(`发现上海规则标识残留：\n${violations.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("辽宁生产源码与 DSL 未发现上海规则标识残留。\n");
}
