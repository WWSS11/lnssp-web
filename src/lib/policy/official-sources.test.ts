import { describe, expect, it } from "vitest";
import { findOfficialPolicySources } from "./official-sources";

describe("官方政策来源跨主题召回", () => {
  it("养老最低缴费年限同时返回全国渐进式决定和辽宁养老文件", () => {
    const sources = findOfficialPolicySources("pension_contribution");
    const nationalDecision = sources.find((source) =>
      source.title.includes("渐进式延迟法定退休年龄"),
    );

    expect(nationalDecision).toBeDefined();
    expect(nationalDecision?.scope).toBe("全国");
    expect(nationalDecision?.key_points?.join(" ")).toContain(
      "2030年起最低缴费年限每年提高6个月",
    );
    expect(nationalDecision?.key_points?.join(" ")).toContain(
      "2039年及以后20年",
    );
    expect(
      sources.some((source) => source.document_no === "辽人社〔2020〕23号"),
    ).toBe(true);
  });
});
