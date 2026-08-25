/**
 * Golden 回归测试 —— 直接从磁盘上的 DSL（规则 + 参数包 + 示例用例）加载，
 * 在内存里跑确定性编排，断言每条示例都能复现其 expected 输出。
 *
 * 这是真实数据驱动的回归基线：任何改动让既有规则示例的输出漂移，都会在 CI 红掉。
 * 全程不依赖数据库（只用纯函数 runTestSuite + orchestrateInMemory）。
 *
 * 已知偏差通过 KNOWN_DIVERGENCES 显式登记；新增或消失都会强制人工复核。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { RuleDefinition } from "@/types/engine";
import { runTestSuite, type TestCase } from "../test-runner";

const DSL_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../dsl/ssp_dsl_v1",
);

/**
 * 已知偏差：以 example_name 为键。每条都已核对过根因，属示例过期 / 策略语义 / 浮点噪声，
 * 不是引擎回归。修复任意一条后，请把它从此清单移除（测试会强制提醒）。
 */
const KNOWN_DIVERGENCES: Record<string, string> = {};

function loadRules(): RuleDefinition[] {
  const dir = path.join(DSL_DIR, "rules");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map(
      (f) =>
        JSON.parse(readFileSync(path.join(dir, f), "utf8")) as RuleDefinition,
    );
}

function loadBaseParams(): Record<string, unknown> {
  const pack = JSON.parse(
    readFileSync(
      path.join(DSL_DIR, "params/policy_params_liaoning_base.json"),
      "utf8",
    ),
  ) as {
    params: Array<{ param_id: string; value: unknown }>;
    tables: Array<{ param_id: string; rows: unknown[] }>;
  };
  // 与 DB seed + loadEffectiveEngine 等价的扁平化：标量取 value、表取 rows。
  const base: Record<string, unknown> = {};
  for (const p of pack.params) base[p.param_id] = p.value;
  for (const t of pack.tables) base[t.param_id] = t.rows;
  return base;
}

function loadGoldenCases(): TestCase[] {
  const seed = JSON.parse(
    readFileSync(
      path.join(DSL_DIR, "tests/rule_examples_as_tests.json"),
      "utf8",
    ),
  ) as { tests: TestCase[] };
  return seed.tests;
}

describe("golden regression (DSL examples)", () => {
  const allRules = loadRules();
  const baseParams = loadBaseParams();
  const cases = loadGoldenCases();
  const knownKeys = new Set(Object.keys(KNOWN_DIVERGENCES));

  // 整套只跑一次：引擎在内存里复用同一组 rule/param 对象时存在就地修改，
  // 重复跑会污染结果（生产中每个请求都从 DB 加载全新对象，故不受影响）。
  const suite = runTestSuite(cases, allRules, baseParams);

  it("loads a non-trivial corpus of rules, params, and seed cases", () => {
    expect(allRules.length).toBe(15);
    expect(Object.keys(baseParams).length).toBeGreaterThanOrEqual(15);
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  it("every non-divergent seeded example reproduces its expected output", () => {
    const failed = suite.results
      .filter((r) => !knownKeys.has(r.name) && !r.pass)
      .map((r) => ({ name: r.name, rule_id: r.rule_id, diff: r.diff }));

    if (failed.length > 0) {
      console.error(
        `Golden regressions (${failed.length}):\n` +
          JSON.stringify(failed, null, 2),
      );
    }
    expect(failed).toEqual([]);
  });

  it("known divergences stay exactly the documented set", () => {
    const actualDivergent = new Set(
      suite.results.filter((r) => !r.pass).map((r) => r.name),
    );

    // 出现未登记的新偏差 = 引擎回归。
    const newDivergences = [...actualDivergent].filter((n) => !knownKeys.has(n));
    // 已登记偏差"消失" = 被（有意/无意）修复，需更新清单显式承认。
    const resolved = [...knownKeys].filter((n) => !actualDivergent.has(n));

    expect({ newDivergences, resolved }).toEqual({
      newDivergences: [],
      resolved: [],
    });
  });
});
