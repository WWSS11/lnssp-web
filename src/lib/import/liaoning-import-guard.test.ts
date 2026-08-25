import { describe, expect, it } from "vitest";
import { validateApprovedLiaoningImportRows } from "./liaoning-import-guard";

describe("辽宁后台导入门禁", () => {
  it("接受已审核的辽宁地市数据", () => {
    const result = validateApprovedLiaoningImportRows([
      { province: "辽宁省", city: "沈阳市", review_status: "approved", name: "用例" },
    ]);
    expect(result.issues).toEqual([]);
    expect(result.normalized[0].city).toBe("沈阳");
  });

  it("拒绝上海历史数据和未审核数据", () => {
    const result = validateApprovedLiaoningImportRows([
      { province: "上海市", city: "上海", review_status: "approved", case_text: "随申办" },
      { province: "辽宁省", city: "大连", review_status: "pending" },
    ]);
    expect(result.normalized).toEqual([]);
    expect(result.issues.some((issue) => issue.field === "content")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "review_status")).toBe(true);
  });
});
