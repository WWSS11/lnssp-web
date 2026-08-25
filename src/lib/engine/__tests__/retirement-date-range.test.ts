import { describe, expect, it } from "vitest";
import { estimateRetirementDateRange } from "../retirement-date-range";

describe("出生日期缺失时的退休区间", () => {
  it("过渡期人群不再默认按1月1日给确定日期", () => {
    const range = estimateRetirementDateRange({
      birth_year: 1976,
      gender: "male",
    });

    expect(range).not.toBeNull();
    expect(range?.earliest).not.toBe(range?.latest);
    expect(range?.precision).toBe("incomplete_birth_date");
  });

  it("完整出生日期不产生估算区间", () => {
    expect(
      estimateRetirementDateRange({
        birth_year: 1976,
        birth_month: 2,
        birth_day: 29,
        gender: "male",
      }),
    ).toBeNull();
  });
});
