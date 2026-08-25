import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateRuleDsl } from "./schema-validator";

const RULES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../dsl/ssp_dsl_v1/rules",
);

describe("DSL rule schema", () => {
  it("validates every checked-in rule file", () => {
    const failures = readdirSync(RULES_DIR)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => {
        const rule = JSON.parse(readFileSync(path.join(RULES_DIR, file), "utf8"));
        return { file, validation: validateRuleDsl(rule) };
      })
      .filter(({ validation }) => !validation.valid);

    expect(failures).toEqual([]);
  });
});
