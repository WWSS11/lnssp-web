import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { RuleDefinition } from "@/types/engine";
import {
  executeSingleRuleInMemory,
  orchestrateInMemory,
} from "../orchestrator";

const DSL_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../dsl/ssp_dsl_v1",
);

interface PolicyPack {
  policy_pack_id: string;
  as_of: string;
  policy_data_as_of: string;
  last_reviewed_at: string;
  applicable_province: string;
  review_status: string;
  confidence: string;
  params: Array<{ param_id: string; value: unknown; source?: string; effective_to?: string | null }>;
  tables: Array<{
    param_id: string;
    rows: Array<Record<string, unknown>>;
    source?: string;
  }>;
}

interface RuleSetFile {
  rule_set_id: string;
  rules: string[];
}

const pack = JSON.parse(
  readFileSync(
    path.join(DSL_DIR, "params/policy_params_liaoning_base.json"),
    "utf8",
  ),
) as PolicyPack;

const ruleSet = JSON.parse(
  readFileSync(
    path.join(DSL_DIR, "rule_sets/rule_set_liaoning_plan_v1.json"),
    "utf8",
  ),
) as RuleSetFile;

const allRules = readdirSync(path.join(DSL_DIR, "rules"))
  .filter((file) => file.endsWith(".json"))
  .map(
    (file) =>
      JSON.parse(
        readFileSync(path.join(DSL_DIR, "rules", file), "utf8"),
      ) as RuleDefinition,
  );

const rulesById = new Map(allRules.map((rule) => [rule.rule_id, rule]));
const params = Object.fromEntries(
  pack.params.map((entry) => [entry.param_id, entry.value]),
);
const tables = Object.fromEntries(
  pack.tables.map((entry) => [entry.param_id, entry.rows]),
);
const flatParams = { ...params, ...tables };

describe("辽宁政策包", () => {
  it("使用辽宁默认标识和明确的数据时点", () => {
    expect(pack.policy_pack_id).toBe("LIAONING_BASE");
    expect(pack.as_of).toBe("2026-08-20");
    expect(pack.policy_data_as_of).toBe("2025-12-31");
    expect(pack.last_reviewed_at).toBe("2026-08-20");
    expect(pack.applicable_province).toBe("辽宁省");
    expect(pack.review_status).toBe("approved");
    expect(pack.confidence).toBe("high");
    expect(ruleSet.rule_set_id).toBe("RS-LIAONING-PLAN-V1");
  });

  it("核心省级参数与官方文件一致", () => {
    expect(params["P-LN-PENSION-CONTRIB-BASE-LOWER"]).toBe(4359);
    expect(params["P-LN-PENSION-CONTRIB-BASE-UPPER"]).toBe(21792);
    expect(params["P-LN-PENSION-RATE-EMPLOYER"]).toBe(0.16);
    expect(params["P-LN-PENSION-RATE-EMPLOYEE"]).toBe(0.08);
    expect(params["P-LN-PENSION-RATE-FLEX"]).toBe(0.2);
    expect(params["P-LN-MEDICAL-LIFETIME-MALE-YEARS"]).toBe(30);
    expect(params["P-LN-MEDICAL-LIFETIME-FEMALE-YEARS"]).toBe(25);
    expect(params["P-LN-UNEMPLOYMENT-MAX-MONTHS"]).toBe(24);
  });

  it("2025年度缴费基数设有明确到期日，不冒充2026精确参数", () => {
    const annualBase = pack.params.find(
      (entry) => entry.param_id === "P-LN-PENSION-CONTRIB-BASE-LOWER",
    );
    expect(annualBase?.effective_to).toBe("2025-12-31");
    expect((annualBase as { availability?: string })?.availability).toBe(
      "historical_only",
    );
  });

  it("辽宁规则集引用的规则和参数全部存在且不含上海参数", () => {
    const selectedRules = ruleSet.rules.map((ruleId) => rulesById.get(ruleId));
    expect(selectedRules.every(Boolean)).toBe(true);

    const parameterIds = new Set(Object.keys(flatParams));
    const missingRefs = selectedRules
      .flatMap((rule) => rule?.parameter_refs ?? [])
      .map((ref) => ref.param_id)
      .filter((paramId) => !parameterIds.has(paramId));

    expect(missingRefs).toEqual([]);
    expect(JSON.stringify(selectedRules)).not.toContain("P-SH-");
    expect(JSON.stringify(selectedRules)).not.toContain("T-SH-");
  });

  it("规则目录只包含辽宁生产规则集中的规则", () => {
    expect([...rulesById.keys()].sort()).toEqual([...ruleSet.rules].sort());
  });

  it("规则集目录只包含辽宁生产规则集", () => {
    expect(
      readdirSync(path.join(DSL_DIR, "rule_sets")).filter((file) =>
        file.endsWith(".json"),
      ),
    ).toEqual(["rule_set_liaoning_plan_v1.json"]);
  });

  it("最终信息门禁在规划模板之前执行", () => {
    expect(ruleSet.rules.indexOf("R-900-FINAL-GATE")).toBeLessThan(
      ruleSet.rules.indexOf("R-700-PLAN-TEMPLATE"),
    );
  });

  it("弹性退休只计算窗口，不覆盖法定退休年龄", () => {
    const rule = rulesById.get("R-115-FLEXIBLE-RETIREMENT");
    const ctx = {
      user: { basic: { retire_preference: "earliest" } },
      params: {},
      calc: {
        retirement: {
          legal_retire_age_years: 61,
          legal_retire_age_months: 6,
          original_retire_age_years: 60,
        },
      },
      plan: {},
    };

    const result = executeSingleRuleInMemory(rule!, ctx);
    const retirement = (result.ctx.calc as { retirement: Record<string, unknown> })
      .retirement;
    expect(retirement.legal_retire_age_years).toBe(61);
    expect(retirement.legal_retire_age_months).toBe(6);
    expect(retirement.earliest_retire_age_years).toBe(60);
    expect(retirement.earliest_retire_age_months).toBe(0);
  });

  it("大龄领金养老支持使用2025生效日期并包含官方证据", () => {
    const rule = rulesById.get("R-530-OLDER-UI-PENSION-FUND-COVERAGE");
    expect(rule?.effective_from).toBe("2025-01-01");
    expect(rule?.effective_to).toBe("2039-12-31");
    expect(rule?.evidence?.[0]?.url).toContain("rst.ln.gov.cn");
  });

  it.each([
    [11, true],
    [12, undefined],
    [-1, undefined],
  ])("距法定退休%s个月时大龄领金窗口结果为%s", (months, expected) => {
    const rule = rulesById.get("R-530-OLDER-UI-PENSION-FUND-COVERAGE");
    const ctx = {
      user: {
        status: { on_unemployment_benefit: true },
        subsidy: { months_to_legal_retire: months },
      },
      params: {},
      calc: {},
      plan: {},
    };
    const result = executeSingleRuleInMemory(rule!, ctx);
    expect(
      (
        result.ctx.calc as {
          subsidy?: { older_ui_pension_fund_eligible?: boolean };
        }
      ).subsidy?.older_ui_pension_fund_eligible,
    ).toBe(expected);
  });

  it.each([
    [1, 3],
    [4, 12],
    [5, 13],
    [8, 16],
    [9, 18],
    [10, 24],
  ])("累计失业保险缴费%s年时初步核算%s个月", (years, months) => {
    const rule = rulesById.get("R-LN-410-UNEMPLOYMENT-DURATION");
    expect(rule).toBeDefined();

    const ctx = {
      user: {
        status: { employment_status: "unemployed" },
        social: { unemployment_insurance_years: years },
      },
      params: flatParams,
      calc: {},
      plan: {},
    };
    const result = executeSingleRuleInMemory(rule!, ctx);

    expect(
      (result.ctx.calc as { unemployment?: { duration_months?: number } })
        .unemployment?.duration_months,
    ).toBe(months);
  });

  it("非失业状态的失业金期限为不适用而不是缴费不足", () => {
    const rule = rulesById.get("R-LN-410-UNEMPLOYMENT-DURATION");
    const result = executeSingleRuleInMemory(rule!, {
      user: {
        status: { employment_status: "employed" },
        social: { unemployment_insurance_years: 0 },
      },
      params: flatParams,
      calc: {},
      plan: {},
    });
    const unemployment = (result.ctx.calc as {
      unemployment?: { applicable?: boolean; duration_months?: number | null };
    }).unemployment;
    expect(unemployment?.applicable).toBe(false);
    expect(unemployment?.duration_months).toBeNull();
  });

  it("就业状态未知时要求补充信息，不判定失业保险不适用", () => {
    const rule = rulesById.get("R-LN-410-UNEMPLOYMENT-DURATION");
    const result = executeSingleRuleInMemory(rule!, {
      user: {
        status: { employment_status: "unknown" },
        social: { unemployment_insurance_years: 5 },
      },
      params: flatParams,
      calc: {},
      plan: {},
    });
    const calc = result.ctx.calc as {
      needs_agent?: boolean;
      unemployment?: { applicable?: boolean | null; duration_months?: number | null };
    };
    expect(calc.unemployment?.applicable).toBeNull();
    expect(calc.unemployment?.duration_months).toBeNull();
    expect(calc.needs_agent).toBe(true);
  });

  it("弹性提前退休按拟选择日期对应年份重新核算最低缴费年限", () => {
    const selected = ruleSet.rules.map((id) => rulesById.get(id)!);
    const result = orchestrateInMemory(
      selected,
      flatParams,
      {
        basic: {
          birth_year: 1970,
          birth_month: 1,
          birth_day: 1,
          birth_date: "1970-01-01",
          gender: "male",
          retire_preference: "earliest",
          planned_retire_date: "2030-01-01",
        },
        social: { pension_contrib_months: 180 },
        status: { employment_status: "employed" },
      },
      "2026-08-20",
    );
    const retirement = result.calc.retirement as Record<string, unknown>;
    expect(retirement.legal_retire_date).toBe("2031-05-01");
    expect(retirement.selected_retire_date).toBe("2030-01-01");
    expect(retirement.minimum_contribution_reference_year).toBe(2030);
    expect((result.calc.pension as Record<string, unknown>).min_years_required).toBe(15.5);
    expect(retirement.pension_start_month).toBeNull();
  });

  it("女性退休口径未知时不输出普通公式退休年龄", () => {
    const rule = rulesById.get("R-110-LOOKUP-LEGAL-RETIRE-AGE");
    const result = executeSingleRuleInMemory(rule!, {
      user: {
        basic: {
          gender: "female",
          female_retire_type: "unknown",
          birth_year: 1975,
          birth_month: 1,
          birth_day: 1,
        },
      },
      params: flatParams,
      calc: {},
      plan: {},
    });
    expect(result.ctx.calc.retirement?.legal_retire_age_years).toBeNull();
    expect(result.ctx.calc.retirement?.legal_retire_date).toBeNull();
    expect(result.ctx.calc.pension?.min_years_required).toBeNull();
    expect(result.ctx.calc.needs_agent).toBe(true);
  });

  it("特殊退休情形强制拦截普通退休日期和养老缺口", () => {
    const selected = ruleSet.rules.map((id) => rulesById.get(id)!);
    const result = orchestrateInMemory(
      selected,
      flatParams,
      {
        basic: {
          birth_year: 1970,
          birth_month: 1,
          birth_day: 1,
          birth_date: "1970-01-01",
          gender: "male",
          retirement_exception_type: "special_work",
        },
        social: { pension_contrib_months: 240 },
        status: { employment_status: "employed" },
      },
      "2026-08-20",
    );
    expect(
      (result.calc as { retirement?: { legal_retire_date?: string } })
        .retirement?.legal_retire_date,
    ).toBeUndefined();
    expect(
      (result.calc as { retirement?: { legal_retire_age_years?: number } })
        .retirement?.legal_retire_age_years,
    ).toBeUndefined();
    expect((result.calc as { pension?: { gap_months?: number } }).pension?.gap_months).toBeUndefined();
    expect(result.calc.needs_agent).toBe(true);
  });

  it("普通男性未提及特殊退休时输出退休日期、养老缺口并保留医保核验提示", () => {
    const selected = ruleSet.rules.map((id) => rulesById.get(id)!);
    const result = orchestrateInMemory(
      selected,
      flatParams,
      {
        basic: {
          birth_year: 1973,
          birth_month: 5,
          birth_day: 10,
          gender: "male",
        },
        social: {
          pension_contrib_months: 18 * 12,
          medical_contrib_months: 20 * 12,
        },
        status: {
          employment_status: "employed",
          on_unemployment_benefit: false,
        },
        mi: { insurance_type: "employee" },
        locations: {
          pension_insured_city: "沈阳",
          medical_insured_city: "沈阳",
          medical_benefit_city: "沈阳",
          unemployment_benefit_city: "沈阳",
        },
      },
      "2026-08-20",
    );

    const retirement = result.calc.retirement as Record<string, unknown>;
    const pension = result.calc.pension as Record<string, unknown>;
    const mi = result.calc.mi as Record<string, unknown>;
    const questionIds = (result.calc.agent_questions as Array<{
      question_id: string;
    }>).map((question) => question.question_id);

    expect(retirement.legal_retire_date).toBe("2035-07-10");
    expect(pension.min_years_required).toBe(18);
    expect(pension.gap_months).toBe(0);
    expect(mi.lifetime_gap_months).toBe(120);
    expect(mi.cumulative_gap_is_preliminary).toBe(true);
    expect(questionIds).not.toContain("Q-RETIREMENT-EXCEPTION");
    expect(questionIds).toContain("Q-MI-BENEFIT-CITY-ACTUAL-MONTHS");
    expect(questionIds).toContain("Q-MI-DEEMED-CONTRIBUTION");
  });

  it("未确认的特殊退休状态不再等同于已确认例外并阻断普通公式", () => {
    const selected = ruleSet.rules.map((id) => rulesById.get(id)!);
    const result = orchestrateInMemory(
      selected,
      flatParams,
      {
        basic: {
          birth_year: 1973,
          birth_month: 5,
          birth_day: 10,
          gender: "male",
          retirement_exception_type: "unknown",
        },
        social: { pension_contrib_months: 18 * 12 },
        status: {
          employment_status: "employed",
          on_unemployment_benefit: false,
        },
      },
      "2026-08-20",
    );

    expect(
      (result.calc.retirement as Record<string, unknown>).legal_retire_date,
    ).toBe("2035-07-10");
    expect((result.calc.pension as Record<string, unknown>).gap_months).toBe(0);
    expect(
      ((result.calc.agent_questions ?? []) as Array<{ question_id: string }>).map(
        (question) => question.question_id,
      ),
    ).not.toContain("Q-RETIREMENT-EXCEPTION");
    expect(
      ((result.calc.warnings ?? []) as Array<{ warning_id: string }>).map(
        (warning) => warning.warning_id,
      ),
    ).toContain("W-RETIREMENT-EXCEPTION-UNCONFIRMED");
  });

  it("职工医保条件不完整时只保留初步缺口并转人工", () => {
    const rule = rulesById.get("R-LN-220-MEDICAL-LIFETIME-GAP")!;
    const result = orchestrateInMemory(
      [rule],
      flatParams,
      {
        basic: { gender: "male" },
        social: { medical_contrib_months: 300 },
        mi: { insurance_type: "employee" },
      },
    );
    const mi = (result.calc as {
      mi?: { lifetime_gap_months?: number; cumulative_gap_is_preliminary?: boolean };
    }).mi;
    expect(mi?.lifetime_gap_months).toBe(60);
    expect(mi?.cumulative_gap_is_preliminary).toBe(true);
    expect(result.calc.needs_agent).toBe(true);
    expect((result.calc.agent_questions as unknown[]).length).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ["male", 300, 360, 60],
    ["female", 240, 300, 60],
  ])(
    "%s退休医保只计算累计缴费年限缺口",
    (gender, paidMonths, requiredMonths, gapMonths) => {
      const rule = rulesById.get("R-LN-220-MEDICAL-LIFETIME-GAP");
      expect(rule).toBeDefined();

      const ctx = {
        user: {
          basic: { gender },
          social: { medical_contrib_months: paidMonths },
        },
        params: flatParams,
        calc: {},
        plan: {},
      };
      const result = executeSingleRuleInMemory(rule!, ctx);
      const mi = (result.ctx.calc as {
        mi?: { lifetime_required_months?: number; lifetime_gap_months?: number };
      }).mi;

      expect(mi?.lifetime_required_months).toBe(requiredMonths);
      expect(mi?.lifetime_gap_months).toBe(gapMonths);
      expect(
        (result.ctx.calc as { warnings?: unknown[] }).warnings,
      ).toHaveLength(1);
    },
  );
});
