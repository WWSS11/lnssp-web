/**
 * AI Agent 工具定义
 *
 * 使用 Vercel AI SDK v6 的 tool() 函数注册所有工具。
 * v6 API: tool({ description, inputSchema: zodSchema(z.object(...)), execute })
 */

import { tool, zodSchema } from "ai";
import { z } from "zod";
import { computePlanService } from "@/lib/engine/plan-service";
import { createRequestLogger } from "@/lib/logging";
import { normalizeLiaoningCity } from "@/lib/regions/liaoning";
import {
  findOfficialPolicySources,
  type PolicyTopic,
} from "@/lib/policy/official-sources";

// ─── 内部类型 ─────────────────────────────────────────────────────────────────

interface AgentQuestion {
  question_id: string;
  field: string;
  label: string;
  hint?: string;
  options?: { value: string; label: string }[];
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const birthYearSchema = z.number().int().min(1940).max(2010);
const birthMonthSchema = z.number().int().min(1).max(12);
const birthDaySchema = z.number().int().min(1).max(31);
const genderSchema = z.enum(["male", "female"]);
const femaleRetireTypeSchema = z.enum(["worker50", "cadre55", "unknown"]);
const retirementExceptionTypeSchema = z.enum([
  "none",
  "special_work",
  "disability",
  "other",
  "unknown",
]);
const deemedContributionStatusSchema = z.enum([
  "none",
  "included",
  "unverified",
]);
const medicalInsuranceTypeSchema = z.enum([
  "employee",
  "resident",
  "unknown",
]);
const targetCitySchema = z
  .string()
  .trim()
  .min(2)
  .max(20)
  .transform((value, ctx) => {
    const city = normalizeLiaoningCity(value);
    if (!city) {
      ctx.addIssue({
        code: "custom",
        message: "参保城市必须是辽宁省内地级市",
      });
      return z.NEVER;
    }
    return city;
  });
const retirePreferenceSchema = z.enum(["earliest", "standard", "latest"]);
const contribMonthsSchema = z.number().int().min(0).max(600);
const unemploymentYearsSchema = z.number().min(0).max(50);
const policyAmountSchema = z.number().positive().max(1_000_000);
const paidMonthsSchema = z
  .array(z.number().int().min(1).max(12))
  .max(12);
const employmentStatusSchema = z.enum([
  "employed",
  "unemployed",
  "flexible",
  "retired",
  "unknown",
]);
const benefitMonthsSchema = z.number().int().min(0).max(600);
const objectiveSchema = z.enum([
  "min_cost",
  "max_pension",
  "keep_medical",
  "balanced",
]);
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD")
  .refine(isValidIsoDate, "日期不是有效的公历日期");

const computePlanSchema = z.object({
  basic: z.object({
    birth_year: birthYearSchema
      .optional()
      .describe("出生年份（数字），如 1973"),
    birth_year_text: z
      .string()
      .trim()
      .max(20)
      .optional()
      .describe("出生年份文本，如 '73年' 或 '1973'，引擎会自动解析"),
    birth_month: birthMonthSchema
      .optional()
      .describe("出生月份，1-12"),
    birth_day: birthDaySchema
      .optional()
      .describe("出生日期，1-31"),
    gender: genderSchema.describe("性别：male=男，female=女"),
    female_retire_type: femaleRetireTypeSchema
      .optional()
      .describe(
        "女性原法定退休年龄分类，用于延迟退休计算：worker50=经退休政策口径认定适用原50周岁的女性；cadre55=经退休政策口径认定适用原55周岁的女性；unknown=暂时无法确认。可参考女工人/生产岗位、女干部/管理技术岗位、灵活就业身份及转岗经历，但不得仅凭普通员工、一线、办公室等口语称呼直接确定；信息不足时必须使用 unknown",
      ),
    retirement_exception_type: retirementExceptionTypeSchema
      .optional()
      .describe(
        "仅当用户明确提到特殊工种、病残或其他提前/特殊退休情形时填写：special_work=特殊工种，disability=病残，other=其他提前或特殊退休，unknown=用户明确提到可能存在但尚不能确认。用户未提及任何特殊退休情形时必须省略本字段，不得填写 unknown；明确表示没有时才填写 none",
      ),
    target_city: targetCitySchema
      .optional()
      .describe(
        "辽宁省参保统筹地区，如沈阳、大连、鞍山；不要填写省份，不明确时不要猜测",
      ),
    retire_preference: retirePreferenceSchema
      .optional()
      .describe(
        "退休偏好：earliest=最早退休（提前最多3年），standard=法定退休，latest=延迟退休（最多3年）",
      ),
    planned_retire_date: isoDateSchema
      .optional()
      .describe("用户明确选择的拟退休日期，格式 YYYY-MM-DD；不得根据偏好猜测填写"),
  }).superRefine(validateBirthDateParts),
  social: z
    .object({
      pension_contrib_months: contribMonthsSchema
        .optional()
        .describe("养老保险已缴月数（0-600，最多 50 年）"),
      medical_contrib_months: contribMonthsSchema
        .optional()
        .describe("医疗保险已缴月数（0-600，最多 50 年）"),
      unemployment_insurance_years: unemploymentYearsSchema
        .optional()
        .describe("失业保险累计缴费年数，允许小数，范围 0-50"),
      deemed_contribution_status: deemedContributionStatusSchema
        .optional()
        .describe("养老缴费月数中的视同缴费状态：none=无，included=已确认计入，unverified=存在但未核定"),
      min_wage_amount_per_month: policyAmountSchema
        .optional()
        .describe(
          "当地最低工资标准（元/月）；仅在用户明确提供时填写，不得由模型猜测",
        ),
      base_lower_amount_per_month: policyAmountSchema
        .optional()
        .describe(
          "社保缴费基数下限（元/月）；仅在用户明确提供时填写，不得由模型猜测",
        ),
      paid_months_in_year: paidMonthsSchema
        .optional()
        .describe("当年已缴费月份列表，每项为1-12，最多12项"),
    })
    .optional(),
  status: z
    .object({
      employment_status: employmentStatusSchema
        .optional()
        .describe(
          "就业状态：employed=在职，unemployed=失业，flexible=灵活就业，retired=已退休，unknown=暂不确定",
        ),
      on_unemployment_benefit: z
        .boolean()
        .optional()
        .describe("是否正在领取失业金"),
      unemployment_benefit_months_used: benefitMonthsSchema
        .optional()
        .describe("已经领取的失业金月数，仅在用户明确提供时填写"),
      unemployment_benefit_months_remaining: benefitMonthsSchema
        .optional()
        .describe("剩余可领取失业金月数，仅在用户明确提供时填写"),
    })
    .optional(),
  subsidy: z
    .object({
      has_employment_difficulty_cert: z
        .boolean()
        .optional()
        .describe("是否已经完成就业困难人员认定"),
    })
    .optional(),
  mi: z
    .object({
      insurance_type: medicalInsuranceTypeSchema
        .optional()
        .describe("医保类型：employee=职工医保，resident=居民医保，unknown=不确定"),
      benefit_city_actual_contrib_months: contribMonthsSchema
        .optional()
        .describe("退休医保待遇享受地的职工医保实际缴费月数"),
      deemed_contribution_included: z
        .boolean()
        .optional()
        .describe("职工医保累计缴费月数是否已包含经确认的视同缴费年限"),
      prev_end_date: isoDateSchema
        .optional()
        .describe("上次医保结束日期，格式 YYYY-MM-DD"),
      enroll_date: isoDateSchema
        .optional()
        .describe("本次医保参保日期，格式 YYYY-MM-DD"),
    })
    .optional(),
  locations: z
    .object({
      pension_insured_city: targetCitySchema.optional().describe("养老保险当前参保地"),
      medical_insured_city: targetCitySchema.optional().describe("医疗保险当前参保地"),
      medical_benefit_city: targetCitySchema.optional().describe("退休医保待遇享受地"),
      unemployment_benefit_city: targetCitySchema.optional().describe("失业保险待遇领取地"),
      household_city: targetCitySchema.optional().describe("户籍地，不得替代参保地或待遇地"),
    })
    .optional(),
  objective: objectiveSchema
    .optional()
    .describe(
      "规划目标：min_cost=最低花费，max_pension=最大养老金，keep_medical=保医保，balanced=均衡",
    ),
});

const validatableFieldSchema = z.enum([
  "basic.birth_year",
  "basic.birth_month",
  "basic.birth_day",
  "basic.gender",
  "basic.female_retire_type",
  "basic.retirement_exception_type",
  "basic.target_city",
  "basic.retire_preference",
  "basic.planned_retire_date",
  "locations.pension_insured_city",
  "locations.medical_insured_city",
  "locations.medical_benefit_city",
  "locations.unemployment_benefit_city",
  "locations.household_city",
  "social.pension_contrib_months",
  "social.medical_contrib_months",
  "social.unemployment_insurance_years",
  "social.deemed_contribution_status",
  "social.min_wage_amount_per_month",
  "social.base_lower_amount_per_month",
  "social.paid_months_in_year",
  "status.employment_status",
  "status.on_unemployment_benefit",
  "status.unemployment_benefit_months_used",
  "status.unemployment_benefit_months_remaining",
  "subsidy.has_employment_difficulty_cert",
  "mi.prev_end_date",
  "mi.enroll_date",
  "mi.insurance_type",
  "mi.benefit_city_actual_contrib_months",
  "mi.deemed_contribution_included",
  "objective",
]);

const validateFieldSchema = z.object({
  field: validatableFieldSchema.describe("需要校验的受支持字段路径"),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.number().int())])
    .describe("用户提供的字段值"),
});

type ComputePlanInput = z.infer<typeof computePlanSchema>;
type ValidateFieldInput = z.infer<typeof validateFieldSchema>;

// ─── Tool 1: computePlan ─────────────────────────────────────────────────────

export const computePlanTool = tool<
  ComputePlanInput,
  Awaited<ReturnType<typeof computePlanExecute>>
>({
  description:
    "根据已知用户画像调用确定性规则引擎，仅生成法定退休年龄对应日期、养老和医保缴费年限初步缺口、失业保险理论总期限及资格线索。它不查询官方个人账户、不确认待遇资格、不完成退休审批，也不计算城市失业金金额。调用时必须合并全部已知信息；政策金额和基数不得由模型猜测。",
  inputSchema: zodSchema(computePlanSchema),
  execute: computePlanExecute,
});

async function computePlanExecute(
  params: ComputePlanInput,
  options?: { experimental_context?: unknown },
) {
  const ctx = options?.experimental_context as { sessionId?: unknown } | undefined;
  const sessionId = typeof ctx?.sessionId === "string" ? ctx.sessionId : undefined;
  try {
    const social = params.social
      ? {
          ...params.social,
          paid_months_in_year: params.social.paid_months_in_year
            ? [...new Set(params.social.paid_months_in_year)].sort((a, b) => a - b)
            : undefined,
        }
      : undefined;
    const userInput = {
      basic: omitFemaleRetireTypeForMale(params.basic),
      social,
      status: params.status,
      subsidy: params.subsidy,
      mi: params.mi,
      locations: params.locations,
      objective: params.objective,
    };

    const result = await computePlanService({ user: userInput, sessionId });

    return {
      success: true as const,
      plan_id: result.planId,
      needs_agent: result.needsAgent,
      questions: result.questions,
      warnings: result.warnings,
      caveats: result.caveats,
      plan: result.plan,
      calc: result.calc,
      meta: result.meta,
    };
  } catch (error) {
    const logger = createRequestLogger();
    logger.error("ai.compute_plan_failed", {
      session_id: sessionId,
      error_message: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false as const,
      error_code: "COMPUTE_PLAN_FAILED" as const,
      error: "计算服务暂时不可用，请稍后重试",
      needs_agent: false,
      questions: [] as AgentQuestion[],
      warnings: [] as string[],
      caveats: [],
      plan: {} as Record<string, unknown>,
      calc: {} as Record<string, unknown>,
      meta: null,
    };
  }
}

// ─── Tool 2: validateField ───────────────────────────────────────────────────

export const validateFieldTool = tool<
  ValidateFieldInput,
  ReturnType<typeof validateFieldValue>
>({
  description:
    "仅在用户提供的单个字段格式含糊或疑似越界时进行校验。明确有效的数据无需调用；它不负责验证政策资格或政策数字。",
  inputSchema: zodSchema(validateFieldSchema),
  execute: async ({ field, value }: ValidateFieldInput) =>
    validateFieldValue(field, value),
});

// ─── Tool 3: updateProfile ──────────────────────────────────────────────────

const updateProfileSchema = z.object({
  basic: z
    .object({
      birth_year_text: z.string().trim().max(20).optional(),
      birth_year: birthYearSchema.optional(),
      birth_month: birthMonthSchema.optional(),
      birth_day: birthDaySchema.optional(),
      gender: genderSchema.optional(),
      female_retire_type: femaleRetireTypeSchema.optional(),
      retirement_exception_type: retirementExceptionTypeSchema
        .optional()
        .describe(
          "仅保存用户明确提到的特殊退休情形；未提及特殊工种、病残或其他提前/特殊退休时必须省略，不能写 unknown",
        ),
      target_city: targetCitySchema.optional(),
      retire_preference: retirePreferenceSchema.optional(),
      planned_retire_date: isoDateSchema.optional(),
    }).superRefine(validateBirthDateParts)
    .optional(),
  social: z
    .object({
      pension_contrib_months: contribMonthsSchema.optional(),
      medical_contrib_months: contribMonthsSchema.optional(),
      unemployment_insurance_years: unemploymentYearsSchema.optional(),
      deemed_contribution_status: deemedContributionStatusSchema.optional(),
      paid_months_in_year: paidMonthsSchema.optional(),
    })
    .optional(),
  status: z
    .object({
      employment_status: employmentStatusSchema.optional(),
      on_unemployment_benefit: z.boolean().optional(),
      unemployment_benefit_months_used: benefitMonthsSchema.optional(),
      unemployment_benefit_months_remaining: benefitMonthsSchema.optional(),
    })
    .optional(),
  subsidy: z
    .object({
      has_employment_difficulty_cert: z.boolean().optional(),
    })
    .optional(),
  mi: z
    .object({
      insurance_type: medicalInsuranceTypeSchema.optional(),
      benefit_city_actual_contrib_months: contribMonthsSchema.optional(),
      deemed_contribution_included: z.boolean().optional(),
      prev_end_date: isoDateSchema.optional(),
      enroll_date: isoDateSchema.optional(),
    })
    .optional(),
  locations: z
    .object({
      pension_insured_city: targetCitySchema.optional(),
      medical_insured_city: targetCitySchema.optional(),
      medical_benefit_city: targetCitySchema.optional(),
      unemployment_benefit_city: targetCitySchema.optional(),
      household_city: targetCitySchema.optional(),
    })
    .optional(),
  objective: objectiveSchema.optional(),
});

type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updateProfileTool = tool<
  UpdateProfileInput,
  { updated: true; profile: UpdateProfileInput }
>({
  description:
    "保存本轮用户明确提供或可无歧义归一化的个人参保信息，供后续对话和测算复用。每轮最多调用一次，合并本轮全部新增或更正字段；不得提交猜测值、政策参数或工具 schema 之外的字段。",
  inputSchema: zodSchema(updateProfileSchema),
  execute: async (params) => ({
    updated: true,
    profile: {
      ...params,
      basic: params.basic
        ? omitFemaleRetireTypeForMale(params.basic)
        : undefined,
      social: params.social
        ? {
            ...params.social,
            paid_months_in_year: params.social.paid_months_in_year
              ? [...new Set(params.social.paid_months_in_year)].sort(
                  (a, b) => a - b,
                )
              : undefined,
          }
        : undefined,
    },
  }),
});

// ─── Tool 4: lookupOfficialPolicy ───────────────────────────────────────────

const policyTopicSchema = z.enum([
  "retirement",
  "pension_contribution",
  "medical_insurance",
  "unemployment",
  "employment_subsidy",
]);

export const lookupOfficialPolicyTool = tool({
  description:
    "查询已人工核验的官方政策来源及政策要点。会同时返回与所选主题关联的全国、省级文件，例如养老最低缴费年限会返回全国渐进式规则。普通政策问答在陈述当前费率、基数、年限、资格条件、待遇或办理口径前必须调用；不查询个人账户，也不确认个人待遇资格。若无匹配来源，不得靠模型记忆补造政策事实。",
  inputSchema: zodSchema(
    z.object({
      topic: policyTopicSchema.describe(
        "政策主题：retirement=退休，pension_contribution=养老缴费，medical_insurance=医保，unemployment=失业保险，employment_subsidy=就业补贴",
      ),
    }),
  ),
  execute: async ({ topic }: { topic: PolicyTopic }) => ({
    found: findOfficialPolicySources(topic).length > 0,
    topic,
    sources: findOfficialPolicySources(topic),
    limitation:
      "仅提供已审核政策来源，不代表已查询个人账户、确认个人资格或取得地市经办结论。",
  }),
});

// ─── 工具集导出 ──────────────────────────────────────────────────────────────

export const tools = {
  computePlan: computePlanTool,
  validateField: validateFieldTool,
  updateProfile: updateProfileTool,
  lookupOfficialPolicy: lookupOfficialPolicyTool,
};

// ─── 内部辅助函数 ─────────────────────────────────────────────────────────────

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 2100) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateBirthDateParts(
  basic: { birth_year?: number; birth_month?: number; birth_day?: number },
  ctx: z.RefinementCtx,
): void {
  if (
    basic.birth_year === undefined ||
    basic.birth_month === undefined ||
    basic.birth_day === undefined
  ) {
    return;
  }
  const date = `${basic.birth_year}-${String(basic.birth_month).padStart(2, "0")}-${String(basic.birth_day).padStart(2, "0")}`;
  if (!isValidIsoDate(date)) {
    ctx.addIssue({
      code: "custom",
      path: ["birth_day"],
      message: "出生日期不是有效的公历日期",
    });
  }
}

function omitFemaleRetireTypeForMale<
  T extends { gender?: string; female_retire_type?: unknown },
>(basic: T): T {
  if (basic.gender !== "male") return basic;

  const normalized = { ...basic };
  delete normalized.female_retire_type;
  return normalized;
}

type NormalizedFieldValue = string | number | boolean | number[];

function validateFieldValue(
  field: ValidateFieldInput["field"],
  value: ValidateFieldInput["value"],
): { valid: boolean; error?: string; normalized?: NormalizedFieldValue } {
  switch (field) {
    case "basic.birth_year": {
      const year = Number(value);
      if (!Number.isInteger(year) || year < 1940 || year > 2010) {
        return {
          valid: false,
          error: `出生年份必须是 1940 到 2010 之间的整数，您输入的是 "${value}"`,
        };
      }
      return { valid: true, normalized: year };
    }

    case "basic.birth_month": {
      const month = Number(value);
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return {
          valid: false,
          error: `出生月份必须是 1 到 12 之间的整数，您输入的是 "${value}"`,
        };
      }
      return { valid: true, normalized: month };
    }

    case "basic.birth_day": {
      const day = Number(value);
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        return {
          valid: false,
          error: `出生日期必须是 1 到 31 之间的整数，您输入的是 "${value}"`,
        };
      }
      return { valid: true, normalized: day };
    }

    case "basic.gender": {
      const genderMap: Record<string, string> = {
        男: "male",
        女: "female",
        male: "male",
        female: "female",
        m: "male",
        f: "female",
      };
      const normalized = genderMap[String(value).toLowerCase()];
      if (!normalized) {
        return {
          valid: false,
          error: `性别必须是"男"或"女"，您输入的是 "${value}"`,
        };
      }
      return { valid: true, normalized };
    }

    case "basic.female_retire_type": {
      const validValues = ["worker50", "cadre55", "unknown"];
      if (!validValues.includes(String(value))) {
        return {
          valid: false,
          error: `女性原法定退休年龄分类必须是 worker50（原50周岁口径）、cadre55（原55周岁口径）或 unknown（暂不确定），您输入的是 "${value}"`,
        };
      }
      return { valid: true, normalized: String(value) };
    }

    case "basic.retirement_exception_type": {
      const parsed = retirementExceptionTypeSchema.safeParse(value);
      return parsed.success
        ? { valid: true, normalized: parsed.data }
        : { valid: false, error: "退休例外情形取值无效" };
    }

    case "basic.target_city": {
      if (typeof value !== "string") {
        return { valid: false, error: "参保城市必须是文字" };
      }
      const parsed = targetCitySchema.safeParse(value);
      if (!parsed.success) {
        return {
          valid: false,
          error: "请填写辽宁省内具体参保城市，如沈阳、大连或鞍山",
        };
      }
      return { valid: true, normalized: parsed.data };
    }

    case "locations.pension_insured_city":
    case "locations.medical_insured_city":
    case "locations.medical_benefit_city":
    case "locations.unemployment_benefit_city":
    case "locations.household_city": {
      if (typeof value !== "string") {
        return { valid: false, error: "城市必须是文字" };
      }
      const parsed = targetCitySchema.safeParse(value);
      return parsed.success
        ? { valid: true, normalized: parsed.data }
        : { valid: false, error: "请填写辽宁省内具体城市" };
    }

    case "basic.retire_preference": {
      const parsed = retirePreferenceSchema.safeParse(value);
      if (!parsed.success) {
        return {
          valid: false,
          error:
            "退休偏好必须是 earliest（最早退休）、standard（法定退休）或 latest（延迟退休）",
        };
      }
      return { valid: true, normalized: parsed.data };
    }

    case "basic.planned_retire_date": {
      const parsed = isoDateSchema.safeParse(value);
      return parsed.success
        ? { valid: true, normalized: parsed.data }
        : { valid: false, error: "拟退休日期必须是有效的 YYYY-MM-DD 日期" };
    }

    case "social.pension_contrib_months":
    case "social.medical_contrib_months": {
      const months = Number(value);
      if (!Number.isInteger(months) || months < 0 || months > 600) {
        return {
          valid: false,
          error: `缴费月数必须是 0 到 600 之间的整数（最多 50 年），您输入的是 "${value}"`,
        };
      }
      return { valid: true, normalized: months };
    }

    case "social.unemployment_insurance_years": {
      const years = Number(value);
      if (!Number.isFinite(years) || years < 0 || years > 50) {
        return {
          valid: false,
          error: `失业保险缴费年数必须是 0 到 50 之间的数字，您输入的是 "${value}"`,
        };
      }
      return { valid: true, normalized: years };
    }

    case "social.deemed_contribution_status": {
      const parsed = deemedContributionStatusSchema.safeParse(value);
      return parsed.success
        ? { valid: true, normalized: parsed.data }
        : { valid: false, error: "视同缴费状态取值无效" };
    }

    case "social.min_wage_amount_per_month":
    case "social.base_lower_amount_per_month": {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
        return {
          valid: false,
          error: `金额必须是大于 0 且不超过 1000000 的数字，您输入的是 "${value}"`,
        };
      }
      return { valid: true, normalized: amount };
    }

    case "social.paid_months_in_year": {
      const months = Array.isArray(value)
        ? value
        : typeof value === "string"
          ? value
              .split(/[，,、\s]+/)
              .filter(Boolean)
              .map(Number)
          : [];
      if (
        months.length === 0 ||
        months.length > 12 ||
        months.some(
          (month) => !Number.isInteger(month) || month < 1 || month > 12,
        )
      ) {
        return {
          valid: false,
          error: "缴费月份必须由 1 到 12 的月份数字组成，且最多 12 项",
        };
      }
      return {
        valid: true,
        normalized: [...new Set(months)].sort((a, b) => a - b),
      };
    }

    case "status.employment_status": {
      const statusMap: Record<string, z.infer<typeof employmentStatusSchema>> = {
        employed: "employed",
        在职: "employed",
        unemployed: "unemployed",
        失业: "unemployed",
        flexible: "flexible",
        灵活就业: "flexible",
        retired: "retired",
        已退休: "retired",
        unknown: "unknown",
        不确定: "unknown",
      };
      const normalized = statusMap[String(value).trim()];
      if (!normalized) {
        return {
          valid: false,
          error: `就业状态必须是 employed（在职）、unemployed（失业）、flexible（灵活就业）、retired（已退休）或 unknown（暂不确定），您输入的是 "${value}"`,
        };
      }
      return { valid: true, normalized };
    }

    case "status.unemployment_benefit_months_used":
    case "status.unemployment_benefit_months_remaining": {
      const months = Number(value);
      if (!Number.isInteger(months) || months < 0 || months > 600) {
        return {
          valid: false,
          error: `失业金月数必须是 0 到 600 之间的整数，您输入的是 "${value}"`,
        };
      }
      return { valid: true, normalized: months };
    }

    case "status.on_unemployment_benefit":
    case "subsidy.has_employment_difficulty_cert":
    case "mi.deemed_contribution_included": {
      if (typeof value === "boolean") {
        return { valid: true, normalized: value };
      }
      const strVal = String(value).toLowerCase();
      if (["true", "是", "yes", "1"].includes(strVal)) {
        return { valid: true, normalized: true };
      }
      if (["false", "否", "no", "0"].includes(strVal)) {
        return { valid: true, normalized: false };
      }
      return {
        valid: false,
        error: `此字段需要是"是"或"否"，您输入的是 "${value}"`,
      };
    }

    case "objective": {
      const validObjectives = [
        "min_cost",
        "max_pension",
        "keep_medical",
        "balanced",
      ];
      if (!validObjectives.includes(String(value))) {
        return {
          valid: false,
          error: `规划目标必须是以下之一：min_cost（最低花费）、max_pension（最大养老金）、keep_medical（保医保）、balanced（均衡），您输入的是 "${value}"`,
        };
      }
      return { valid: true, normalized: String(value) };
    }

    case "mi.prev_end_date":
    case "mi.enroll_date": {
      const date = String(value).trim();
      if (!isValidIsoDate(date)) {
        return {
          valid: false,
          error: `日期必须是有效的 YYYY-MM-DD 格式，您输入的是 "${value}"`,
        };
      }
      return { valid: true, normalized: date };
    }

    case "mi.insurance_type": {
      const parsed = medicalInsuranceTypeSchema.safeParse(value);
      return parsed.success
        ? { valid: true, normalized: parsed.data }
        : { valid: false, error: "医保类型取值无效" };
    }

    case "mi.benefit_city_actual_contrib_months": {
      const months = Number(value);
      if (!Number.isInteger(months) || months < 0 || months > 600) {
        return { valid: false, error: "待遇地实际缴费月数必须是 0 到 600 的整数" };
      }
      return { valid: true, normalized: months };
    }

    default:
      return { valid: false, error: `不支持校验字段 "${field}"` };
  }
}
