import { describe, expect, it } from "vitest";
import { hasDistinctAuthenticatedReviewer, normalizeStageInput } from "./publish-service";

describe("发布门禁", () => {
  it("同一认证主体不能完成双人复核", () => {
    expect(hasDistinctAuthenticatedReviewer("admin:a", "admin:a")).toBe(false);
    expect(hasDistinctAuthenticatedReviewer("admin:a", "admin:b")).toBe(true);
    expect(hasDistinctAuthenticatedReviewer(null, "admin:b")).toBe(false);
  });

  it("只允许顺序发布阶段名称", () => {
    expect(normalizeStageInput("production")).toBe("production");
    expect(normalizeStageInput("anything")).toBeNull();
  });
});
