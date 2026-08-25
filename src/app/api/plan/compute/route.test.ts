import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { computePlanService } = vi.hoisted(() => ({
  computePlanService: vi.fn(),
}));
vi.mock("@/lib/engine/plan-service", () => ({ computePlanService }));

import { POST } from "./route";

describe("POST /api/plan/compute", () => {
  beforeEach(() => computePlanService.mockReset());

  it("由服务端固定测算日和默认政策链路", async () => {
    computePlanService.mockResolvedValue({
      planId: "plan-1", plan: {}, calc: {}, meta: {}, needsAgent: false,
      questions: [], warnings: [], caveats: [],
    });
    const request = new NextRequest("http://localhost/api/plan/compute", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.21" },
      body: JSON.stringify({ user: { basic: { gender: "male", birth_year: 1970 } } }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(computePlanService).toHaveBeenCalledOnce();
    const input = computePlanService.mock.calls[0][0];
    expect(input.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(input).not.toHaveProperty("ruleSetId");
    expect(input).not.toHaveProperty("policyPackId");
  });

  it("拒绝公开客户端历史回放", async () => {
    const request = new NextRequest("http://localhost/api/plan/compute", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.22" },
      body: JSON.stringify({ user: {}, as_of_date: "2025-01-01" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(computePlanService).not.toHaveBeenCalled();
  });
});
