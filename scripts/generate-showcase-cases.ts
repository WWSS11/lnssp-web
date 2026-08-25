/**
 * Batch generate review-pending Liaoning showcase case drafts.
 *
 * Usage:
 *   npx tsx scripts/generate-showcase-cases.ts
 *
 * Reads high-quality test cases, calls OpenAI to generate structured AI responses,
 * and inserts them into the showcase_cases table without publishing them.
 */

import "dotenv/config";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getOpenAIConfig } from "../src/lib/ai/config";

// ── DB setup ────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  process.stderr.write("DATABASE_URL not set\n");
  process.exit(1);
}

function getOpenAIConfigOrExit() {
  try {
    return getOpenAIConfig();
  } catch (err) {
    process.stderr.write(
      `${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
}

const { apiKey: OPENAI_API_KEY, baseURL: OPENAI_URL, model: OPENAI_MODEL } =
  getOpenAIConfigOrExit();

const neonSql = neon(DATABASE_URL);
const db = drizzle({ client: neonSql });
const openai = createOpenAI({ apiKey: OPENAI_API_KEY, baseURL: OPENAI_URL });

// ── Types ───────────────────────────────────────────────────────────────────

interface TestCase {
  case_uid: string;
  source: string;
  post_date: string;
  input: {
    basic: {
      gender: string;
      birth_year?: number;
      birth_month?: number;
      female_retire_type?: string;
    };
    social?: {
      pension_contrib_months?: number;
      pension_contrib_years?: number;
    };
    status?: {
      employment_status?: string;
    };
  };
  expected: {
    retire_age?: string;
    retire_date?: string;
    min_contrib_years?: number;
    monthly_cost?: number;
    pension_amount?: number;
    gap_months?: number;
    gap_years?: number;
  };
  case_text_excerpt: string;
  region: {
    province: "辽宁省";
    city: string;
  };
  review_status: "approved" | "pending" | "rejected";
  policy_data_as_of: string;
  official_sources: string[];
}

// ── Load and filter cases ───────────────────────────────────────────────────

function loadTestCases(): TestCase[] {
  const sourcePath = resolve(
    __dirname,
    "../data/liaoning-showcase-cases-approved.json",
  );
  if (!existsSync(sourcePath)) {
    throw new Error(
      "缺少已审核辽宁案例 data/liaoning-showcase-cases-approved.json；已禁止使用历史上海转录数据生成辽宁展示案例",
    );
  }
  const raw = readFileSync(sourcePath, "utf-8");
  return JSON.parse(raw);
}

function filterHighQuality(cases: TestCase[]): TestCase[] {
  return cases.filter(
    (c) =>
      c.input.basic.birth_year &&
      c.input.basic.gender &&
      c.expected.retire_age &&
      c.case_text_excerpt.length > 100 &&
      c.region?.province === "辽宁省" &&
      Boolean(c.region.city) &&
      c.review_status === "approved" &&
      /^\d{4}-\d{2}-\d{2}$/.test(c.policy_data_as_of) &&
      c.official_sources.length > 0,
  );
}

function categorize(c: TestCase): string {
  const g = c.input.basic.gender;
  const by = c.input.basic.birth_year ?? 0;
  const status = c.input.status?.employment_status;

  if (g === "female" && by >= 1980) return "female_young";
  if (g === "female" && by >= 1970) return "female_mid";
  if (g === "female") return "female_old";
  if (g === "male" && by >= 1975) return "male_young";
  if (g === "male" && by >= 1965) return "male_mid";
  if (g === "male") return "male_old";
  if (status === "flexible") return "flexible";
  return "other";
}

function buildTags(c: TestCase): string[] {
  const tags: string[] = [];
  tags.push(c.input.basic.gender === "female" ? "女性" : "男性");
  if (c.input.basic.birth_year) tags.push(`${c.input.basic.birth_year}年`);
  if (c.input.basic.female_retire_type === "worker50") tags.push("工人50岁");
  if (c.input.basic.female_retire_type === "cadre55") tags.push("管理岗55岁");
  if (c.input.status?.employment_status === "flexible") tags.push("灵活就业");
  if (c.input.status?.employment_status === "unemployed") tags.push("失业");
  if (c.expected.pension_amount) tags.push("养老金估算");
  const months =
    c.input.social?.pension_contrib_months ??
    (c.input.social?.pension_contrib_years
      ? c.input.social.pension_contrib_years * 12
      : 0);
  if (months > 0) tags.push(`已缴${Math.round(months / 12)}年`);
  return tags;
}

function buildTitle(c: TestCase): string {
  const gender = c.input.basic.gender === "female" ? "女性" : "男性";
  const year = c.input.basic.birth_year ?? "?";
  const parts = [`${year}年${gender}`];
  if (c.input.status?.employment_status === "flexible") parts.push("灵活就业");
  if (c.input.status?.employment_status === "unemployed") parts.push("失业");
  const months =
    c.input.social?.pension_contrib_months ??
    (c.input.social?.pension_contrib_years
      ? c.input.social.pension_contrib_years * 12
      : 0);
  if (months > 0) parts.push(`${Math.round(months / 12)}年工龄`);
  return parts.join(" · ");
}

function buildUserMessage(c: TestCase): string {
  const gender = c.input.basic.gender === "female" ? "女" : "男";
  const year = c.input.basic.birth_year;
  const month = c.input.basic.birth_month;
  const months = c.input.social?.pension_contrib_months;
  const years = c.input.social?.pension_contrib_years;
  const status = c.input.status?.employment_status;

  let msg = `我是${gender}的，${year}年`;
  if (month) msg += `${month}月`;
  msg += "出生";

  if (months) {
    msg += `，养老保险已经交了${Math.round(months / 12)}年`;
  } else if (years) {
    msg += `，养老保险已经交了${years}年`;
  }

  if (status === "flexible") msg += "，目前灵活就业";
  else if (status === "unemployed") msg += "，目前失业";
  else if (status === "employed") msg += "，目前在职";

  msg += "，想了解退休规划方案";
  return msg;
}

// ── AI response generation ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是"社保规划助手"，专注于辽宁省社保规划。请基于用户信息和参考预期结果，生成一份可执行、无占位符的方案。

输出格式要求（Markdown）：

**结论**
- [一句话结论，不超过30字]

**关键数字**
- 推荐退休节点：[日期 + 年龄]
- 养老缺口：[X个月，<=0写已满足]
- 医保终身缺口：[X个月，缺失写“暂无数据（需补充医保月数）”]
- 可领失业金：[X个月，仅在适用时展示]

**你现在要做（0-30天）**
1. [动作 + 时间点 + 目的]
2. [动作 + 时间点 + 目的]
3. [动作 + 时间点 + 目的]

**路径对比**
- [方案A：退休节点、缺口、成本、补贴节省]
- [方案B：退休节点、缺口、成本、补贴节省]

**推荐路径时间线**
1. [年龄段]：[动作]
2. [年龄段]：[动作]
3. [退休节点]：[办理退休]

**补贴机会**
- [补贴名称]：[可申请/待确认/暂不符合]
  - 申请时机：[timing]
  - 预估金额：[金额或“暂无数据”]
  - 首步动作：[action_steps第一条]

**注意事项**
- [政策边界 + 风险提醒]
- 政策数据截至 [日期]，以官方最新发布为准

硬性约束：
- 禁止输出任何占位符： [X]、待定、TBD、...
- 只能使用给定上下文中的数字，不得编造。
- 缺失值统一写“暂无数据（需补充xxx）”。`;

async function generateAiResponse(
  userMessage: string,
  testCase: TestCase,
): Promise<string> {
  const contextInfo = `
用户基本信息：
- 参保地区：辽宁省${testCase.region.city}
- 性别：${testCase.input.basic.gender === "female" ? "女" : "男"}
- 出生年份：${testCase.input.basic.birth_year}
${testCase.input.basic.birth_month ? `- 出生月份：${testCase.input.basic.birth_month}` : ""}
${testCase.input.basic.female_retire_type ? `- 退休口径：${testCase.input.basic.female_retire_type === "worker50" ? "工人50岁" : "管理岗55岁"}` : ""}
${testCase.input.social?.pension_contrib_months ? `- 养老已缴月数：${testCase.input.social.pension_contrib_months}` : ""}
${testCase.input.social?.pension_contrib_years ? `- 养老已缴年数：${testCase.input.social.pension_contrib_years}` : ""}
${testCase.input.status?.employment_status ? `- 就业状态：${testCase.input.status.employment_status}` : ""}

参考预期结果（来自已审核辽宁案例）：
${testCase.expected.retire_age ? `- 退休年龄：${testCase.expected.retire_age}` : ""}
${testCase.expected.retire_date ? `- 退休日期：${testCase.expected.retire_date}` : ""}
${testCase.expected.min_contrib_years ? `- 最低缴费年限：${testCase.expected.min_contrib_years}年` : ""}
${testCase.expected.monthly_cost ? `- 月缴费：${testCase.expected.monthly_cost}元` : ""}
${testCase.expected.pension_amount ? `- 养老金：${testCase.expected.pension_amount}元/月` : ""}

原始案例文本参考：
${testCase.case_text_excerpt.slice(0, 500)}

政策资料核验日期：${testCase.policy_data_as_of}
官方来源：${testCase.official_sources.join("；")}
`;

  const result = streamText({
    model: openai(OPENAI_MODEL),
    system: SYSTEM_PROMPT,
    prompt: `${userMessage}\n\n---\n以下是补充上下文（不要直接引用，仅作参考）：\n${contextInfo}`,
    maxOutputTokens: 1500,
  });

  let text = "";
  for await (const delta of result.textStream) {
    text += delta;
  }

  return text.trim();
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateAiResponseWithRetry(
  userMessage: string,
  testCase: TestCase,
  maxAttempts = 3,
): Promise<string> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await generateAiResponse(userMessage, testCase);
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts) break;
      const backoffMs = 800 * attempt;
      process.stderr.write(
        `Retry ${attempt}/${maxAttempts - 1} for ${testCase.case_uid} after error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      await sleep(backoffMs);
    }
  }
  throw lastError;
}

function hasPlaceholderText(text: string): boolean {
  return (
    text.includes("[X]") ||
    text.includes("待定") ||
    text.includes("TBD") ||
    text.includes("...")
  );
}

function fieldText(value: unknown, missingHint: string): string {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim().length === 0)
  ) {
    return `暂无数据（需补充${missingHint}）`;
  }
  return String(value);
}

function moneyText(value: number | undefined, missingHint: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return `暂无数据（需补充${missingHint}）`;
  }
  return `¥${value.toLocaleString("zh-CN")}`;
}

function buildFallbackAiResponse(testCase: TestCase): string {
  const statusMap: Record<string, string> = {
    employed: "在职",
    unemployed: "失业",
    flexible: "灵活就业",
    retired: "已退休",
  };
  const genderLabel = testCase.input.basic.gender === "female" ? "女性" : "男性";
  const statusKey = testCase.input.status?.employment_status ?? "unknown";
  const statusLabel = statusMap[statusKey] ?? "状态未说明";

  const pensionMonths =
    testCase.input.social?.pension_contrib_months ??
    (testCase.input.social?.pension_contrib_years
      ? testCase.input.social.pension_contrib_years * 12
      : undefined);
  const minYears = testCase.expected.min_contrib_years;
  const minMonths =
    typeof minYears === "number" ? Math.max(0, Math.round(minYears * 12)) : undefined;
  const gapMonths =
    typeof testCase.expected.gap_months === "number"
      ? testCase.expected.gap_months
      : typeof pensionMonths === "number" && typeof minMonths === "number"
        ? Math.max(minMonths - pensionMonths, 0)
        : undefined;

  const subsidyLines = [
    "- 当前案例不自动认定地方补贴资格；需按参保地已审核规则另行核验",
  ];

  const action1 =
    statusKey === "unemployed"
      ? "尽快完成失业登记，并按待遇领取地经办要求核对失业金申领资格。"
      : "30天内先核对个人累计缴费月数和账户状态。";
  const action2 =
    statusKey === "flexible"
      ? "按灵活就业路径连续缴费，避免断缴影响退休办理。"
      : "根据当前状态确认后续参保路径（在职/灵活就业/失业衔接）。";

  const retireNode = [
    fieldText(testCase.expected.retire_date, "退休日期"),
    fieldText(testCase.expected.retire_age, "退休年龄"),
  ].join(" / ");

  return `**结论**
- ${genderLabel}${statusLabel}场景下，建议走“先补缺口再锁定退休节点”的稳健路径。

**关键数字**
- 推荐退休节点：${retireNode}
- 养老已缴：${fieldText(pensionMonths, "养老累计月数")} 个月
- 最低缴费要求：${fieldText(minMonths, "最低缴费年限")} 个月
- 养老缺口：${fieldText(gapMonths, "缴费缺口")}
- 参考月成本：${moneyText(testCase.expected.monthly_cost, "月缴成本")}
- 参考养老金：${moneyText(testCase.expected.pension_amount, "养老金预估")}

**你现在要做（0-30天）**
1. ${action1}
2. ${action2}
3. 准备身份证、社保缴费记录，到街道/社保窗口核对口径。

**路径建议**
- 保守路径：先补足养老缺口，再办理退休，优先保障可退休性。
- 均衡路径：补缺口同时评估补贴，兼顾现金流与累计工龄。

**补贴机会**
${subsidyLines.join("\n")}

**注意事项**
- 本条为脚本回退生成，核心数字来自 case 的 input/expected 数据。
- 政策执行以当地社保经办机构与12333答复为准。`;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const requireLlmOnly =
    process.env.SHOWCASE_REQUIRE_LLM === "1" ||
    process.argv.includes("--strict-llm");

  const allCases = loadTestCases();
  const highQuality = filterHighQuality(allCases);
  process.stdout.write(
    `Loaded ${allCases.length} cases, ${highQuality.length} high quality\n`,
  );

  // Deduplicate by birth_year + gender to avoid too many similar cases
  const seen = new Set<string>();
  const unique: TestCase[] = [];
  for (const c of highQuality) {
    const key = `${c.input.basic.gender}-${c.input.basic.birth_year}-${c.input.status?.employment_status ?? "unknown"}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(c);
    }
  }
  process.stdout.write(`After dedup: ${unique.length} unique cases\n`);

  // 先生成完整批次，再以未发布草稿追加；任何异常都不会触碰已有展示记录。
  const BATCH_SIZE = 5;
  const preparedRows: Array<{
    caseUid: string;
    title: string;
    tags: string[];
    userMessage: string;
    aiResponse: string;
    inputData: Record<string, unknown>;
    expectedData: Record<string, unknown>;
    category: string;
    province: "辽宁省";
    city: string;
    reviewStatus: "pending";
    policyDataAsOf: string;
    officialSources: string[];
    generatedBy: string;
    isPublished: boolean;
    sortOrder: number;
  }> = [];
  let llmSuccess = 0;
  let llmFailed = 0;
  let fallbackUsed = 0;

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (c, idx) => {
        const userMessage = buildUserMessage(c);
        const title = buildTitle(c);
        const tags = buildTags(c);
        const category = categorize(c);

        let aiResponse: string;
        try {
          aiResponse = await generateAiResponseWithRetry(userMessage, c, 3);
          if (hasPlaceholderText(aiResponse)) {
            if (requireLlmOnly) {
              throw new Error(
                `placeholder content returned for ${c.case_uid} in strict mode`,
              );
            }
            process.stderr.write(
              `Generated placeholder for ${c.case_uid}, fallback template used.\n`,
            );
            aiResponse = buildFallbackAiResponse(c);
            llmFailed++;
            fallbackUsed++;
          } else {
            llmSuccess++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(`Failed for ${c.case_uid}: ${msg}\n`);
          llmFailed++;
          if (requireLlmOnly) {
            throw err;
          }
          aiResponse = buildFallbackAiResponse(c);
          fallbackUsed++;
        }

        return {
          caseUid: c.case_uid,
          title,
          tags,
          userMessage,
          aiResponse,
          inputData: c.input as unknown as Record<string, unknown>,
          expectedData: c.expected as unknown as Record<string, unknown>,
          category,
          province: "辽宁省" as const,
          city: c.region.city,
          reviewStatus: "pending" as const,
          policyDataAsOf: c.policy_data_as_of,
          officialSources: c.official_sources,
          generatedBy: OPENAI_MODEL,
          isPublished: false,
          sortOrder: i + idx,
        };
      }),
    );

    preparedRows.push(...results);

    process.stdout.write(
      `Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(unique.length / BATCH_SIZE)}: generated ${preparedRows.length}/${unique.length}\n`,
    );
  }

  process.stdout.write(
    `LLM summary: success=${llmSuccess}, failed=${llmFailed}, fallback=${fallbackUsed}\n`,
  );

  if (requireLlmOnly && fallbackUsed > 0) {
    throw new Error(
      `strict mode failed: fallback used ${fallbackUsed} times, abort writing`,
    );
  }

  if (preparedRows.length === 0) {
    throw new Error("没有符合条件的已审核辽宁源案例，未写入数据库");
  }

  let inserted = 0;
  for (const v of preparedRows) {
    const result = await db.execute(
      sql`INSERT INTO showcase_cases
          (case_uid, title, tags, user_message, ai_response, input_data, expected_data,
           category, province, city, review_status, policy_data_as_of,
           official_sources, generated_by, is_published, sort_order)
          SELECT ${v.caseUid}, ${v.title}, ${JSON.stringify(v.tags)}::jsonb,
                 ${v.userMessage}, ${v.aiResponse}, ${JSON.stringify(v.inputData)}::jsonb,
                 ${JSON.stringify(v.expectedData)}::jsonb, ${v.category}, ${v.province},
                 ${v.city}, ${v.reviewStatus}, ${v.policyDataAsOf},
                 ${JSON.stringify(v.officialSources)}::jsonb, ${v.generatedBy},
                 ${v.isPublished}, ${v.sortOrder}
          WHERE NOT EXISTS (
            SELECT 1 FROM showcase_cases WHERE case_uid = ${v.caseUid}
          )`,
    );
    inserted += result.rowCount ?? 0;
  }

  process.stdout.write(
    `\n=== Complete: ${inserted} review-pending drafts inserted; existing rows preserved ===\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
