import { describe, expect, it } from "vitest";
import { PlanComputeRequestSchema, PublicPlanComputeRequestSchema } from "./plan-input";

describe("PlanComputeRequestSchema", () => {
  it("接受完整画像并标准化字符串和已缴月份", () => {
    const result = PlanComputeRequestSchema.parse({
      user: {
        basic: {
          birth_year_text: "  1973年  ",
          birth_year: 1973,
          birth_month: 8,
          birth_day: 16,
          gender: "female",
          female_retire_type: "unknown",
          target_city: "  沈阳  ",
          retire_preference: "standard",
        },
        social: {
          pension_contrib_months: 180,
          medical_contrib_months: 120,
          unemployment_insurance_years: 3.5,
          base_lower_amount_per_month: 4_000,
          min_wage_amount_per_month: 2_000,
          paid_months_in_year: [12, 1, 1, 6],
        },
        status: {
          employment_status: "flexible",
          on_unemployment_benefit: false,
          unemployment_benefit_months_used: 0,
          unemployment_benefit_months_remaining: 6,
        },
        subsidy: { has_employment_difficulty_cert: null },
        mi: {
          prev_end_date: "2026-01-31",
          enroll_date: "2026-02-01",
        },
        locations: {
          pension_insured_city: "沈阳市",
          medical_insured_city: "大连",
          medical_benefit_city: "鞍山",
          unemployment_benefit_city: "抚顺",
          household_city: "丹东",
        },
        objective: "balanced",
      },
      as_of_date: "2026-08-17",
      rule_set_id: "RS-LIAONING-PLAN-V1",
      policy_pack_id: "LIAONING_BASE",
    });

    expect(result.user.basic?.birth_year_text).toBe("1973年");
    expect(result.user.basic?.target_city).toBe("沈阳");
    expect(result.user.basic?.retire_preference).toBe("standard");
    expect(result.user.social?.paid_months_in_year).toEqual([1, 6, 12]);
    expect(result.user.locations?.pension_insured_city).toBe("沈阳");
    expect(result.user.locations?.medical_benefit_city).toBe("鞍山");
  });

  it("标准化辽宁城市后缀并拒绝省外城市", () => {
    const normalized = PlanComputeRequestSchema.parse({
      user: { basic: { target_city: "辽宁省大连市" } },
    });
    expect(normalized.user.basic?.target_city).toBe("大连");

    expect(
      PlanComputeRequestSchema.safeParse({
        user: { basic: { target_city: "上海" } },
      }).success,
    ).toBe(false);
  });

  it.each([
    ["出生年份过小", { user: { basic: { birth_year: 1939 } } }],
    ["出生月份越界", { user: { basic: { birth_month: 13 } } }],
    ["出生日期不存在", { user: { basic: { birth_year: 1976, birth_month: 2, birth_day: 31 } } }],
    ["缴费月数为负", { user: { social: { pension_contrib_months: -1 } } }],
    ["缴费月数超过50年", { user: { social: { medical_contrib_months: 601 } } }],
    ["金额不是正数", { user: { social: { min_wage_amount_per_month: 0 } } }],
    ["已缴月份越界", { user: { social: { paid_months_in_year: [13] } } }],
    ["医保日期不存在", { user: { mi: { enroll_date: "2026-02-30" } } }],
    ["测算日期格式错误", { user: {}, as_of_date: "2026/08/17" }],
    ["规则集标识为空", { user: {}, rule_set_id: "   " }],
  ])("拒绝%s", (_name, input) => {
    expect(PlanComputeRequestSchema.safeParse(input).success).toBe(false);
  });

  it("不接受客户端覆盖引擎派生字段", () => {
    const result = PlanComputeRequestSchema.parse({
      user: {
        basic: { gender: "male", birth_date: "1970-01-01" },
        subsidy: { months_to_legal_retire: 1 },
      },
    });

    expect(result.user.basic).not.toHaveProperty("birth_date");
    expect(result.user.subsidy).not.toHaveProperty("months_to_legal_retire");
  });

  it.each(["as_of_date", "rule_set_id", "policy_pack_id"])(
    "公开接口拒绝客户端控制 %s",
    (field) => {
      expect(
        PublicPlanComputeRequestSchema.safeParse({
          user: {},
          [field]: field === "as_of_date" ? "2025-01-01" : "override",
        }).success,
      ).toBe(false);
    },
  );

  it("男性不需要女性退休口径并会清除误传值", () => {
    const withoutFemaleType = PlanComputeRequestSchema.parse({
      user: { basic: { gender: "male", birth_year: 1970 } },
    });
    const withFemaleType = PlanComputeRequestSchema.parse({
      user: {
        basic: {
          gender: "male",
          birth_year: 1970,
          female_retire_type: "worker50",
        },
      },
    });

    expect(withoutFemaleType.user.basic?.gender).toBe("male");
    expect(withoutFemaleType.user.basic).not.toHaveProperty(
      "female_retire_type",
    );
    expect(withFemaleType.user.basic).not.toHaveProperty("female_retire_type");
  });
});
