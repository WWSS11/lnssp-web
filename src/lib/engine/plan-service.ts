/**
 * 规划计算服务（单一编排入口）
 *
 * 把"跑规则引擎 → 抽取追问/警告/提示 → 补充场景对比与补贴建议 → 落库"这条主链路
 * 收敛到一个函数 `computePlanService`，供两个调用方共用：
 * - AI 工具 `computePlan`（`src/lib/ai/tools.ts`）
 * - HTTP 接口 `/api/plan/compute`（`src/app/api/plan/compute/route.ts`）
 *
 * 此前这两条路径各自调用 `orchestrate` + `savePlan`，但只有工具路径做了 scenarios /
 * subsidy 富化，导致同样的输入经不同入口得到的结果不一致。这里统一口径。
 */

import { orchestrate } from "./orchestrator";
import type { OrchestratorResult } from "./orchestrator";
import { adviseSubsidies, type SubsidyRecommendation } from "./subsidy-advisor";
import {
  extractNeedsAgent,
  extractQuestions,
  extractWarnings,
  extractCaveats,
  type AgentQuestion,
  type Caveat,
} from "./calc-extractors";
import { savePlan } from "@/lib/db/queries";

// ─── 类型 ───────────────────────────────────────────────────────────────────

export type { AgentQuestion, Caveat } from "./calc-extractors";

export interface ComputePlanServiceInput {
  /** 规范化后的用户画像（basic/social/status/subsidy/mi/objective） */
  user: Record<string, unknown>;
  asOfDate?: string;
  ruleSetId?: string;
  policyPackId?: string;
  /** 是否落库（工具与 API 都需要；测试可关闭） */
  persist?: boolean;
  /** 创建者匿名会话 id，落库后用于 /api/plan/[id] 的归属校验 */
  sessionId?: string;
}

export interface ComputePlanServiceResult {
  planId: string | null;
  needsAgent: boolean;
  questions: AgentQuestion[];
  warnings: string[];
  caveats: Caveat[];
  plan: Record<string, unknown>;
  calc: Record<string, unknown>;
  meta: OrchestratorResult["meta"];
}

// ─── 主入口 ─────────────────────────────────────────────────────────────────

/**
 * 计算社保规划方案：统一的编排 + 富化 + 落库流程。
 */
export async function computePlanService(
  input: ComputePlanServiceInput,
): Promise<ComputePlanServiceResult> {
  const result = await orchestrate({
    user: input.user,
    as_of_date: input.asOfDate,
    rule_set_id: input.ruleSetId,
    policy_pack_id: input.policyPackId,
  });

  const needsAgent = extractNeedsAgent(result.calc);
  const questions = extractQuestions(result.calc);
  const warnings = extractWarnings(result.calc);
  const caveats = extractCaveats(result.calc);

  const enrichedCalc = enrichCalc(result, input.user, needsAgent);

  let planId: string | null = null;
  if (input.persist ?? true) {
    const saved = await savePlan({
      userInput: input.user as Record<string, unknown>,
      calcResult: enrichedCalc as Record<string, unknown>,
      planOutput: result.plan as Record<string, unknown>,
      trace: result.trace as unknown[],
      ruleSetVersion: `${result.meta.rule_set_id}@v${result.meta.rule_set_version}`,
      policyPackVersion: result.meta.policy_pack_revision,
      policyParamSnapshot: result.meta.policy_param_snapshot,
      ruleSnapshot: result.meta.rule_snapshot,
      sourceSnapshot: result.meta.source_snapshot,
      asOfDate: result.meta.as_of_date,
      sessionId: input.sessionId,
    });
    planId = saved?.id ?? null;
  }

  return {
    planId,
    needsAgent,
    questions,
    warnings,
    caveats,
    plan: result.plan,
    calc: enrichedCalc,
    meta: result.meta,
  };
}

// ─── 富化：场景对比 + 补贴建议 ────────────────────────────────────────────────

/**
 * 在引擎原始 calc 基础上补充已经由辽宁生产规则核算过的待遇建议。
 * 弹性退休需要最低缴费年限、告知与协商等条件；在这些字段建模完成前，不生成
 * 把用户偏好直接当成实际退休日期的场景对比。
 */
function enrichCalc(
  result: OrchestratorResult,
  user: Record<string, unknown>,
  needsAgent: boolean,
): Record<string, unknown> {
  const enriched: Record<string, unknown> & {
    subsidy_recommendations?: SubsidyRecommendation[];
  } = { ...result.calc };

  const subsidyRecommendations = needsAgent
    ? []
    : adviseSubsidies(result.calc, user);
  if (subsidyRecommendations.length > 0) {
    enriched.subsidy_recommendations = subsidyRecommendations;
  }

  return enriched;
}
