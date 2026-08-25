import { describe, expect, it } from "vitest";
import { pickParamDraftFields, pickRuleDraftFields } from "./editable-entity";

describe("草稿字段白名单", () => {
  it("参数更新不能绕过发布门禁或篡改版本身份", () => {
    expect(pickParamDraftFields({ value: 1, status: "published", version: 99, id: 7 }))
      .toEqual({ value: 1 });
  });

  it("规则更新不能绕过发布门禁", () => {
    expect(pickRuleDraftFields({ notes: "ok", status: "published", ruleId: "other" }))
      .toEqual({ notes: "ok" });
  });
});
