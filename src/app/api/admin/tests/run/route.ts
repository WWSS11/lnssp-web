import { NextRequest, NextResponse } from "next/server";
import {
  listTests,
  updateTestResult,
  getEffectiveRules,
  getEffectiveParams,
} from "@/lib/db/queries";
import { runTestCase } from "@/lib/engine/test-runner";
import type { RuleDefinition } from "@/types/engine";
import {
  DEFAULT_POLICY_PACK_ID,
  DEFAULT_RULE_SET_ID,
} from "@/lib/engine/region-config";

export const dynamic = "force-dynamic";

interface TestRunRequest {
  scope: "examples" | "regression" | "all";
  rule_id?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: TestRunRequest = await req.json();
    const { scope, rule_id } = body;

    if (!scope || !["examples", "regression", "all"].includes(scope)) {
      return NextResponse.json(
        { error: "Invalid scope. Use 'examples', 'regression', or 'all'" },
        { status: 400 },
      );
    }

    const filters: { ruleId?: string; source?: string } = {};
    if (rule_id) filters.ruleId = rule_id;
    if (scope === "examples") filters.source = "example";
    else if (scope === "regression") filters.source = "regression";

    const tests = await listTests(filters);

    const asOfDate = new Date().toISOString().slice(0, 10);
    const [{ rules: ruleRows }, paramRows] = await Promise.all([
      getEffectiveRules(DEFAULT_RULE_SET_ID, asOfDate),
      getEffectiveParams(DEFAULT_POLICY_PACK_ID, asOfDate),
    ]);

    const allRules = ruleRows.map((r) => ({
      ...(r.decisionTable as object),
      rule_id: r.ruleId,
      name: r.name,
      module: r.module,
      dsl_version: r.dslVersion,
      priority: r.priority,
      status: r.status,
      effective_from: r.effectiveFrom,
      effective_to: r.effectiveTo,
      inputs: r.inputs,
      parameter_refs: r.parameterRefs,
      decision_table: r.decisionTable,
      outputs: r.outputs,
      examples: r.examples,
    })) as RuleDefinition[];

    const baseParams: Record<string, unknown> = {};
    for (const p of paramRows) {
      if (p.type === "scalar") {
        baseParams[p.paramId] = p.value;
      } else if (p.type === "table" || p.type === "timeline") {
        baseParams[p.paramId] = p.rows;
      }
    }

    const results = [];
    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      const result = runTestCase(
        {
          rule_id: test.ruleId ?? null,
          name: test.name,
          input: test.input as Record<string, unknown>,
          params_override:
            (test.paramsOverride as Record<string, unknown>) ?? null,
          expected: test.expected as Record<string, unknown>,
        },
        allRules,
        baseParams,
      );

      await updateTestResult(test.id, result);

      if (result.pass) {
        passed++;
      } else {
        failed++;
      }

      results.push({
        test_id: test.id,
        testId: test.id,
        name: test.name,
        rule_id: test.ruleId,
        ruleId: test.ruleId,
        pass: result.pass,
        passed: result.pass,
        actual: result.actual,
        expected: result.expected,
        diff: result.diff,
      });
    }

    const total = tests.length;
    const pass_rate = total > 0 ? passed / total : 0;

    return NextResponse.json({
      total,
      passed,
      failed,
      pass_rate,
      passRate: pass_rate * 100,
      results,
    });
  } catch {
    return NextResponse.json({ error: "Failed to run tests" }, { status: 500 });
  }
}
