import { describe, expect, it } from "vitest";
import { adviseSubsidies } from "../subsidy-advisor";

describe("辽宁待遇建议", () => {
  it("不会为未启用规则补造4050或4757建议", () => {
    const result = adviseSubsidies({}, {});
    expect(result).toEqual([]);
  });

  it("大龄领金养老支持明确为先缴后申请，不声称自动代缴", () => {
    const [result] = adviseSubsidies(
      { subsidy: { older_ui_pension_fund_eligible: true } },
      {},
    );

    expect(result.subsidy_name).toContain("养老保险费支持");
    expect(result.eligible).toBeNull();
    expect(result.prerequisites.join(" ")).toContain("最低缴费标准");
    expect(result.action_steps.join(" ")).toContain("提出申请");
    expect(result.action_steps.join(" ")).toContain("缴费凭证");
    expect(result.action_steps.join(" ")).not.toContain("自动");
  });

  it("失业保险只展示期限初算并保留资格核定边界", () => {
    const [result] = adviseSubsidies(
      { unemployment: { duration_months: 13 } },
      {},
    );

    expect(result.eligible).toBeNull();
    expect(result.estimated_amount).toBeNull();
    expect(result.estimated_duration_months).toBe(13);
    expect(result.subsidy_name).toContain("期限初步核算");
  });

  it("失业保险不足一年明确标记为不符合，而不是已满足", () => {
    const [result] = adviseSubsidies(
      { unemployment: { eligible: false, duration_months: 0 } },
      {},
    );

    expect(result.eligible).toBe(false);
    expect(result.estimated_amount).toBeNull();
    expect(result.estimated_duration_months).toBe(0);
  });
});
