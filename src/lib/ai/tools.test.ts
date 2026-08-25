import { beforeEach, describe, expect, it, vi } from "vitest";

const { computePlanService } = vi.hoisted(() => ({
  computePlanService: vi.fn(),
}));

vi.mock("@/lib/engine/plan-service", () => ({ computePlanService }));

import { computePlanTool, lookupOfficialPolicyTool } from "./tools";

type ToolExecute = (
  input: Record<string, unknown>,
) => Promise<{
  found?: boolean;
  sources?: unknown;
  calc?: Record<string, unknown>;
}>;

describe("AI 工具调用回归", () => {
  beforeEach(() => computePlanService.mockReset());

  it("养老最低缴费年限查询通过真实工具返回全国过渡表", async () => {
    const execute = lookupOfficialPolicyTool.execute as unknown as ToolExecute;
    const result = await execute({ topic: "pension_contribution" });
    const sourceText = JSON.stringify(result.sources);

    expect(result.found).toBe(true);
    expect(sourceText).toContain("全国人民代表大会常务委员会");
    expect(sourceText).toContain("2030年起最低缴费年限每年提高6个月");
    expect(sourceText).toContain("2039年及以后20年");
  });

  it("普通男性测算工具调用不带入未提及的特殊退休状态", async () => {
    computePlanService.mockResolvedValue({
      planId: null,
      needsAgent: true,
      questions: [],
      warnings: [],
      caveats: [],
      plan: {},
      calc: {
        retirement: { legal_retire_date: "2035-07-10" },
        pension: { min_years_required: 18, gap_months: 0 },
        mi: { lifetime_gap_months: 120, cumulative_gap_is_preliminary: true },
      },
      meta: {},
    });

    const execute = computePlanTool.execute as unknown as ToolExecute;
    const result = await execute({
      basic: {
        gender: "male",
        birth_year: 1973,
        birth_month: 5,
        birth_day: 10,
      },
      social: {
        pension_contrib_months: 216,
        medical_contrib_months: 240,
      },
      status: { employment_status: "employed" },
      mi: { insurance_type: "employee" },
      locations: {
        pension_insured_city: "沈阳",
        medical_insured_city: "沈阳",
        medical_benefit_city: "沈阳",
      },
    });

    const serviceInput = computePlanService.mock.calls[0][0];
    expect(serviceInput.user.basic).not.toHaveProperty(
      "retirement_exception_type",
    );
    expect(result.calc).toMatchObject({
      retirement: { legal_retire_date: "2035-07-10" },
      pension: { min_years_required: 18, gap_months: 0 },
      mi: { lifetime_gap_months: 120, cumulative_gap_is_preliminary: true },
    });
  });
});
