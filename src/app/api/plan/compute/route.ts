import { NextRequest, NextResponse } from "next/server";
import { PublicPlanComputeRequestSchema } from "@/lib/validators/plan-input";
import { computePlanService } from "@/lib/engine/plan-service";
import {
  attachAnonymousSessionCookie,
  ensureAnonymousSession,
} from "@/lib/security/anon-session";
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getClientIp,
} from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const PLAN_RATE_LIMIT = 12;
const PLAN_RATE_WINDOW_MS = 60_000;
const MAX_REQUEST_BYTES = 64 * 1024;

export async function POST(req: NextRequest) {
  const { sessionId, isNewSession } = ensureAnonymousSession(req);
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(`plan:${clientIp}`, {
    limit: PLAN_RATE_LIMIT,
    windowMs: PLAN_RATE_WINDOW_MS,
  });

  const respondJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    applyRateLimitHeaders(response, rateLimit, PLAN_RATE_LIMIT);
    if (isNewSession) {
      attachAnonymousSessionCookie(response, sessionId);
    }
    return response;
  };

  if (!rateLimit.allowed) {
    return respondJson({ error: "请求过于频繁，请稍后重试" }, { status: 429 });
  }

  const contentLengthRaw = req.headers.get("content-length");
  const contentLength = contentLengthRaw ? parseInt(contentLengthRaw, 10) : 0;
  if (!Number.isNaN(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return respondJson(
      { error: `请求体过大，最大 ${MAX_REQUEST_BYTES} 字节` },
      { status: 413 },
    );
  }

  try {
    const body = await req.json();
    const parsed = PublicPlanComputeRequestSchema.safeParse(body);

    if (!parsed.success) {
      return respondJson(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { user } = parsed.data;
    const asOfDate = new Date().toISOString().slice(0, 10);

    const result = await computePlanService({
      user: user as Record<string, unknown>,
      asOfDate,
      sessionId,
    });

    return respondJson({
      success: true,
      plan_id: result.planId,
      plan: result.plan,
      calc: result.calc,
      meta: result.meta,
      needs_agent: result.needsAgent,
      questions: result.questions,
      warnings: result.warnings,
      caveats: result.caveats,
    });
  } catch {
    return respondJson({ error: "Failed to compute plan" }, { status: 500 });
  }
}
