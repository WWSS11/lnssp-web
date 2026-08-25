import { describe, expect, it } from "vitest";
import { isPublicShowcaseCandidate } from "./publication-policy";

describe("展示案例发布隔离", () => {
  const approved = {
    province: "辽宁省",
    city: "沈阳",
    reviewStatus: "approved",
    reviewedBy: "reviewer-2",
    reviewedAt: "2026-08-20",
    policyDataAsOf: "2025-12-31",
    officialSources: ["https://example.gov.cn/policy"],
    isPublished: true,
  };

  it("只有完整审核链路的辽宁案例可公开", () => {
    expect(isPublicShowcaseCandidate(approved)).toBe(true);
  });

  it.each([
    ["旧上海案例", { province: "上海市" }],
    ["待审核 LLM 草稿", { reviewStatus: "pending" }],
    ["缺审核人", { reviewedBy: null }],
    ["缺官方来源", { officialSources: [] }],
    ["未发布", { isPublished: false }],
  ])("隔离%s", (_name, override) => {
    expect(isPublicShowcaseCandidate({ ...approved, ...override })).toBe(false);
  });
});
