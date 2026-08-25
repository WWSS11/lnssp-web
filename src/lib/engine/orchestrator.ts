/* eslint-disable @typescript-eslint/no-explicit-any */
import type { RuleDefinition, TraceEntry } from "@/types/engine";
import {
  getEffectivePolicyPackVersion,
  getEffectiveRules,
  getEffectiveParamsForPolicyPacks,
  listPublishedPolicyPackIds,
} from "@/lib/db/queries";
import { executeRule } from "./executor";
import { getDeep, setDeep } from "./actions";
import {
  DEFAULT_RULE_SET_ID,
  selectPolicyPacksForUser,
} from "./region-config";
import { estimateRetirementDateRange } from "./retirement-date-range";

export interface OrchestratorInput {
  user: Record<string, unknown>;
  as_of_date?: string;
  rule_set_id?: string;
  policy_pack_id?: string;
  // Camel-case aliases for API compatibility
  asOfDate?: string;
  ruleSetId?: string;
  policyPackId?: string;
}

export interface OrchestratorResult {
  plan: Record<string, unknown>;
  calc: Record<string, unknown>;
  user: Record<string, unknown>;
  trace: TraceEntry[];
  meta: {
    rule_set_id: string;
    rule_set_version: number;
    policy_pack_id: string;
    policy_pack_ids: string[];
    policy_pack_revision: string;
    policy_param_versions: number[];
    policy_data_as_of: string;
    policy_last_reviewed_at: string;
    policy_review_due_at: string;
    policy_scope: "province" | "mixed" | "city";
    policy_routes: ReturnType<typeof selectPolicyPacksForUser>["domains"];
    target_city: string | null;
    requested_city_policy_pack_id: string | null;
    policy_param_snapshot: Array<Record<string, unknown>>;
    rule_snapshot: Array<Record<string, unknown>>;
    source_snapshot: string[];
    as_of_date: string;
    rules_executed: number;
  };
  /** Effective rule definitions used in this run (for audit/debug consumers). */
  effectiveRules?: RuleDefinition[];
  /** Flattened params used in this run (for audit/debug consumers). */
  flatParams?: Record<string, unknown>;
}

/**
 * Main orchestrator: loads rule set, params, and executes all rules sequentially.
 */
export async function orchestrate(
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
  const ruleSetId =
    input.rule_set_id ?? input.ruleSetId ?? DEFAULT_RULE_SET_ID;
  const asOfDate =
    input.as_of_date ??
    input.asOfDate ??
    new Date().toISOString().split("T")[0];
  const explicitPolicyPackId = input.policy_pack_id ?? input.policyPackId;
  const availablePolicyPackIds = await listPublishedPolicyPackIds(asOfDate);
  const policySelection = selectPolicyPacksForUser(
    input.user,
    availablePolicyPackIds,
    explicitPolicyPackId,
  );
  const policyPackIds = policySelection.resolvedPolicyPackIds;
  const policyPackId = policyPackIds[0];

  // Load rule set, rules, and params from DB
  const [{ ruleSet, rules: effectiveRules }, effectiveParams, packMetadata] =
    await Promise.all([
      getEffectiveRules(ruleSetId, asOfDate),
      getEffectiveParamsForPolicyPacks(policyPackIds, asOfDate),
      Promise.all(
        policyPackIds.map((id) => getEffectivePolicyPackVersion(id, asOfDate)),
      ),
    ]);

  if (!ruleSet) {
    throw new Error(`Rule set not found: ${ruleSetId}`);
  }
  if (effectiveRules.length === 0) {
    throw new Error(`No effective rules found for rule set: ${ruleSetId}`);
  }
  if (effectiveParams.length === 0) {
    throw new Error(`No effective params found for policy packs: ${policyPackIds.join(", ")}`);
  }
  if (packMetadata.some((metadata) => !metadata)) {
    throw new Error(
      `Reviewed policy-pack metadata missing: ${policyPackIds.filter((_, index) => !packMetadata[index]).join(", ")}`,
    );
  }
  const reviewedMetadata = packMetadata.filter(
    (metadata): metadata is NonNullable<typeof metadata> => Boolean(metadata),
  );
  const policyDataAsOf = minDate(
    reviewedMetadata.map((item) => item.dataAsOf).filter(isNonEmptyString),
  );
  const policyLastReviewedAt = minDate(
    reviewedMetadata.map((item) => item.lastReviewedAt).filter(isNonEmptyString),
  );
  const reviewDueDates = reviewedMetadata
    .map((item) => item.reviewDueAt)
    .filter(isNonEmptyString);
  const policyReviewDueAt = reviewDueDates.length > 0 ? minDate(reviewDueDates) : null;

  // Flatten params into a params namespace
  const flatParams = flattenParams(effectiveParams);

  // Build initial context.
  // Seed calc._today with asOfDate so R-120's `date_diff_months(_today, retire_date)`
  // resolves (it was previously unset -> null -> months_to_legal_retire always 0).
  const ctx: any = {
    user: structuredClone(input.user),
    params: flatParams,
    calc: { _today: asOfDate },
    plan: {},
  };
  const blocksStandardRetirement = applyRetirementSafetyGates(ctx);

  // Build rule map by rule_id for ordered execution
  const ruleMap = new Map<string, any>();
  for (const rule of effectiveRules) {
    ruleMap.set(rule.ruleId, rule);
  }

  // Get ordered rule_id array from rule set (already fetched above)
  const orderedRuleIds = (ruleSet?.rules as string[]) ?? [];

  // Execute rules sequentially in order, collecting RuleDefinitions for reuse
  const allTrace: TraceEntry[] = [];
  const ruleDefs: RuleDefinition[] = [];
  let rulesExecuted = 0;

  for (const ruleId of orderedRuleIds) {
    if (
      blocksStandardRetirement &&
      [
        "R-110-LOOKUP-LEGAL-RETIRE-AGE",
        "R-115-FLEXIBLE-RETIREMENT",
        "R-120-COMPUTE-RETIRE-DATE",
        "R-200-MIN-PENSION-YEARS",
        "R-210-PENSION-GAP",
        "R-530-OLDER-UI-PENSION-FUND-COVERAGE",
      ].includes(ruleId)
    ) {
      continue;
    }
    if (
      ruleId === "R-210-PENSION-GAP" &&
      ctx.user?.social?.deemed_contribution_status === "unverified"
    ) {
      applyUnverifiedPensionDeemedContributionGate(ctx);
      continue;
    }
    const dbRule = ruleMap.get(ruleId);
    if (!dbRule) continue;

    // Convert DB row to RuleDefinition
    const ruleDef: RuleDefinition = {
      dsl_version: dbRule.dslVersion,
      rule_id: dbRule.ruleId,
      name: dbRule.name,
      module: dbRule.module,
      status: dbRule.status,
      priority: dbRule.priority,
      effective_from: dbRule.effectiveFrom,
      effective_to: dbRule.effectiveTo,
      supersedes: dbRule.supersedes as string[],
      notes: dbRule.notes ?? undefined,
      inputs: dbRule.inputs as any[],
      parameter_refs: dbRule.parameterRefs as any[],
      decision_table: dbRule.decisionTable as any,
      outputs: dbRule.outputs as any[],
      examples: dbRule.examples as any[],
      evidence: dbRule.evidence as any[],
    };

    ruleDefs.push(ruleDef);

    const result = executeRule(ruleDef, ctx);
    allTrace.push(...result.trace);
    rulesExecuted++;

    // Auto-compute months_to_legal_retire after R-120 runs
    if (ruleId === "R-120-COMPUTE-RETIRE-DATE") {
      autoComputeMonthsToRetire(ctx, asOfDate);
      applySelectedRetirementDate(ctx);
    }
    if (ruleId === "R-LN-220-MEDICAL-LIFETIME-GAP") {
      applyMedicalQualificationGate(ctx);
    }
  }

  if (!blocksStandardRetirement) addIncompleteBirthDateRange(ctx);
  addPolicyBoundaryWarnings(ctx, asOfDate, policySelection, policyDataAsOf);

  const policyParamSnapshot = effectiveParams.map((param) => ({
    param_id: param.paramId,
    version: param.version,
    type: param.type,
    value: param.value,
    rows: param.rows,
    unit: param.unit,
    effective_from: param.effectiveFrom,
    effective_to: param.effectiveTo,
    source: param.source,
    policy_pack_id: param.policyPackId,
    applicable_province: param.applicableProvince,
    applicable_city: param.applicableCity,
    insurance_type: param.insuranceType,
    availability: param.availability,
    reviewed_at: param.reviewedAt,
    review_status: param.reviewStatus,
    confidence: param.confidence,
  }));
  const ruleSnapshot = effectiveRules.map((rule) => ({
    rule_id: rule.ruleId,
    version: rule.version,
    effective_from: rule.effectiveFrom,
    effective_to: rule.effectiveTo ?? null,
    evidence: rule.evidence ?? [],
  }));
  const sourceSnapshot = Array.from(new Set([
    ...effectiveParams.map((param) => param.source).filter(isNonEmptyString),
    ...ruleDefs.flatMap((rule) =>
      (rule.evidence ?? [])
        .map((evidence) => evidence.url)
        .filter(isNonEmptyString),
    ),
  ]));

  return {
    plan: ctx.plan ?? {},
    calc: ctx.calc ?? {},
    user: ctx.user ?? {},
    trace: allTrace,
    meta: {
      rule_set_id: ruleSetId,
      rule_set_version: ruleSet.version,
      policy_pack_id: policyPackId,
      policy_pack_ids: policyPackIds,
      policy_pack_revision: `${policyPackIds.join("+")}@${effectiveParams
        .map((param) => `${param.paramId}:v${param.version}`)
        .sort()
        .join(",")}`,
      policy_param_versions: [
        ...new Set(effectiveParams.map((param) => param.version)),
      ].sort((a, b) => a - b),
      policy_data_as_of: policyDataAsOf,
      policy_last_reviewed_at: policyLastReviewedAt,
      policy_review_due_at: policyReviewDueAt ?? "",
      policy_scope: policySelection.scope,
      policy_routes: policySelection.domains,
      target_city: policySelection.domains.pension.city,
      requested_city_policy_pack_id:
        policySelection.domains.pension.requestedPolicyPackId,
      policy_param_snapshot: policyParamSnapshot,
      rule_snapshot: ruleSnapshot,
      source_snapshot: sourceSnapshot,
      as_of_date: asOfDate,
      rules_executed: rulesExecuted,
    },
    effectiveRules: ruleDefs,
    flatParams,
  };
}

/**
 * Execute rules using in-memory rule definitions and params (no DB).
 * Used by the test runner and seed validation.
 */
export function orchestrateInMemory(
  rules: RuleDefinition[],
  params: Record<string, unknown>,
  userInput: Record<string, unknown>,
  asOfDate?: string,
): {
  plan: Record<string, unknown>;
  calc: Record<string, unknown>;
  user: Record<string, unknown>;
  trace: TraceEntry[];
} {
  const ctx: any = {
    user: structuredClone(userInput),
    params: structuredClone(params),
    calc: {},
    plan: {},
  };
  const blocksStandardRetirement = applyRetirementSafetyGates(ctx);

  const allTrace: TraceEntry[] = [];

  for (const rule of rules) {
    if (
      blocksStandardRetirement &&
      [
        "R-110-LOOKUP-LEGAL-RETIRE-AGE",
        "R-115-FLEXIBLE-RETIREMENT",
        "R-120-COMPUTE-RETIRE-DATE",
        "R-200-MIN-PENSION-YEARS",
        "R-210-PENSION-GAP",
        "R-530-OLDER-UI-PENSION-FUND-COVERAGE",
      ].includes(rule.rule_id)
    ) {
      continue;
    }
    if (
      rule.rule_id === "R-210-PENSION-GAP" &&
      ctx.user?.social?.deemed_contribution_status === "unverified"
    ) {
      applyUnverifiedPensionDeemedContributionGate(ctx);
      continue;
    }
    const result = executeRule(rule, ctx);
    allTrace.push(...result.trace);

    // Auto-compute months_to_legal_retire after R-120
    if (rule.rule_id === "R-120-COMPUTE-RETIRE-DATE") {
      autoComputeMonthsToRetire(
        ctx,
        asOfDate ?? new Date().toISOString().split("T")[0],
      );
      applySelectedRetirementDate(ctx);
    }
    if (rule.rule_id === "R-LN-220-MEDICAL-LIFETIME-GAP") {
      applyMedicalQualificationGate(ctx);
    }
  }


  if (!blocksStandardRetirement) addIncompleteBirthDateRange(ctx);

  return {
    plan: ctx.plan ?? {},
    calc: ctx.calc ?? {},
    user: ctx.user ?? {},
    trace: allTrace,
  };
}

function applySelectedRetirementDate(ctx: any): void {
  const basic = asRecord(ctx.user?.basic);
  const retirement = asRecord(ctx.calc?.retirement);
  const birthDate = basic.birth_date;
  const legalDate = retirement.legal_retire_date;
  const legalYears = retirement.legal_retire_age_years;
  const legalMonths = retirement.legal_retire_age_months;
  const originalYears = retirement.original_retire_age_years;

  if (
    !isNonEmptyString(birthDate) ||
    !isNonEmptyString(legalDate) ||
    typeof legalYears !== "number" ||
    typeof legalMonths !== "number" ||
    typeof originalYears !== "number"
  ) {
    return;
  }

  const legalAgeMonths = legalYears * 12 + legalMonths;
  const earliestAgeMonths = Math.max(originalYears * 12, legalAgeMonths - 36);
  const earliestDate = addMonthsToIsoDate(birthDate, earliestAgeMonths);
  const latestDate = addMonthsToIsoDate(birthDate, legalAgeMonths + 36);
  const preference = basic.retire_preference ?? "standard";
  const explicitChoice = basic.planned_retire_date;
  const selectedDate = isNonEmptyString(explicitChoice)
    ? explicitChoice
    : preference === "earliest"
      ? earliestDate
      : preference === "latest"
        ? latestDate
        : legalDate;

  if (selectedDate < earliestDate || selectedDate > latestDate) {
    setDeep(ctx, "calc.retirement.selected_retire_date", null);
    setDeep(ctx, "calc.retirement.minimum_contribution_reference_year", null);
    setDeep(ctx, "calc.needs_agent", true);
    appendAgentQuestion(ctx, {
      question_id: "Q-PLANNED-RETIRE-DATE",
      field: "user.basic.planned_retire_date",
      text: `拟选择退休时间须在 ${earliestDate} 至 ${latestDate} 的弹性窗口内，请重新确认；最终时间仍须经单位和经办机构办理。`,
    });
    return;
  }

  setDeep(ctx, "calc.retirement.selected_retire_date", selectedDate);
  setDeep(ctx, "calc.retirement.selected_retire_year", Number(selectedDate.slice(0, 4)));
  setDeep(
    ctx,
    "calc.retirement.minimum_contribution_reference_year",
    Number((selectedDate < legalDate ? selectedDate : legalDate).slice(0, 4)),
  );
  setDeep(ctx, "calc.retirement.retirement_approval_status", "not_confirmed");
  setDeep(ctx, "calc.retirement.pension_start_month", null);

  if (selectedDate !== legalDate) {
    appendWarning(
      ctx,
      "W-SELECTED-RETIREMENT-DATE-PRELIMINARY",
      selectedDate < legalDate
        ? `已按拟选择的弹性提前退休时间 ${selectedDate} 对应年份重新核算最低缴费年限；该日期不是已审批退休时间。`
        : `拟选择弹性延迟退休时间为 ${selectedDate}；按规定最低缴费年限仍以法定退休年龄对应年份核算，且须与单位协商并完成审批。`,
    );
  }
}

function addMonthsToIsoDate(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const totalMonths = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = totalMonths % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(
    Math.min(day, lastDay),
  ).padStart(2, "0")}`;
}

function applyRetirementSafetyGates(ctx: any): boolean {
  const exceptionType = ctx.user?.basic?.retirement_exception_type;
  if (exceptionType === "unknown") {
    appendWarning(
      ctx,
      "W-RETIREMENT-EXCEPTION-UNCONFIRMED",
      "用户提到可能存在但尚未确认的特殊退休情形；当前结果仅按普通退休公式初步计算，如后续确认属于特殊工种、病残或其他特殊退休情形，应改由参保地经办机构核验。",
    );
    return false;
  }
  if (
    !["special_work", "disability", "other"].includes(exceptionType)
  ) {
    return false;
  }

  setDeep(ctx, "calc.needs_agent", true);
  appendAgentQuestion(ctx, {
    question_id: "Q-RETIREMENT-EXCEPTION",
    field: "user.basic.retirement_exception_type",
    text: "已识别到特殊工种、病残或其他特殊退休情形，普通延迟退休公式不适用。请提交参保地经办机构认定所需的工种、档案或劳动能力鉴定信息进行人工核验。",
  });
  appendWarning(
    ctx,
    "W-RETIREMENT-EXCEPTION",
    "存在特殊退休情形，本次不输出普通公式计算的退休年龄、退休日期、最低缴费年限缺口及相关补贴计划。",
  );
  return true;
}

function applyUnverifiedPensionDeemedContributionGate(ctx: any): void {
  setDeep(ctx, "calc.needs_agent", true);
  appendAgentQuestion(ctx, {
    question_id: "Q-PENSION-DEEMED-CONTRIBUTION",
    field: "user.social.deemed_contribution_status",
    text: "存在尚未经办机构确认或尚未计入累计月数的养老视同缴费年限，请先完成认定并确认计入后的累计缴费月数。",
  });
  appendWarning(
    ctx,
    "W-PENSION-DEEMED-UNVERIFIED",
    "养老视同缴费年限尚未核定，本次不输出养老缴费缺口。",
  );
}

function applyMedicalQualificationGate(ctx: any): void {
  const mi = asRecord(ctx.user?.mi);
  const locations = asRecord(ctx.user?.locations);
  const insuranceType = mi.insurance_type;

  setDeep(ctx, "calc.mi.cumulative_gap_is_preliminary", true);
  if (insuranceType === "resident") {
    setDeep(ctx, "calc.mi.applicable", false);
    setDeep(ctx, "calc.mi.lifetime_required_months", null);
    setDeep(ctx, "calc.mi.lifetime_gap_months", null);
    appendWarning(
      ctx,
      "W-MI-NOT-EMPLOYEE",
      "当前为居民医保，职工医保退休累计缴费年限初步缺口不适用。",
    );
    return;
  }

  if (insuranceType !== "employee") {
    setDeep(ctx, "calc.mi.applicable", null);
    setDeep(ctx, "calc.needs_agent", true);
    appendAgentQuestion(ctx, {
      question_id: "Q-MI-INSURANCE-TYPE",
      field: "user.mi.insurance_type",
      text: "请确认累计缴费月数对应职工医保还是居民医保；只有职工医保适用退休累计缴费年限初步缺口。",
    });
    return;
  }

  setDeep(ctx, "calc.mi.applicable", true);
  const missing: Array<{ question_id: string; field: string; text: string }> = [];
  if (!locations.medical_benefit_city) {
    missing.push({
      question_id: "Q-MI-BENEFIT-CITY",
      field: "user.locations.medical_benefit_city",
      text: "请确认退休后职工医保待遇享受地。",
    });
  }
  if (mi.benefit_city_actual_contrib_months == null) {
    missing.push({
      question_id: "Q-MI-BENEFIT-CITY-ACTUAL-MONTHS",
      field: "user.mi.benefit_city_actual_contrib_months",
      text: "请确认在医保待遇享受地的职工医保实际缴费月数。",
    });
  }
  if (mi.deemed_contribution_included == null) {
    missing.push({
      question_id: "Q-MI-DEEMED-CONTRIBUTION",
      field: "user.mi.deemed_contribution_included",
      text: "请确认当前职工医保累计缴费月数是否已包含经认定的视同缴费年限。",
    });
  }
  if (missing.length > 0) {
    setDeep(ctx, "calc.needs_agent", true);
    missing.forEach((question) => appendAgentQuestion(ctx, question));
  }
}

function appendAgentQuestion(
  ctx: any,
  question: { question_id: string; field: string; text: string },
): void {
  const questions = Array.isArray(ctx.calc?.agent_questions)
    ? ctx.calc.agent_questions
    : [];
  if (!questions.some((item: any) => item?.question_id === question.question_id)) {
    questions.push(question);
  }
  setDeep(ctx, "calc.agent_questions", questions);
}

function appendWarning(ctx: any, warning_id: string, text: string): void {
  const warnings = Array.isArray(ctx.calc?.warnings) ? ctx.calc.warnings : [];
  if (!warnings.some((item: any) => item?.warning_id === warning_id)) {
    warnings.push({ warning_id, text });
  }
  setDeep(ctx, "calc.warnings", warnings);
}

function addIncompleteBirthDateRange(ctx: any): void {
  const range = estimateRetirementDateRange(ctx.user?.basic);
  if (!range) return;

  setDeep(ctx, "calc.retirement.legal_retire_date_range", range);
  const caveats = Array.isArray(ctx.calc?.caveats) ? ctx.calc.caveats : [];
  if (!caveats.some((item: any) => item?.caveat_id === "C-BIRTH-DATE-RANGE")) {
    caveats.push({
      caveat_id: "C-BIRTH-DATE-RANGE",
      text: `出生月日不完整，法定退休日期只能估计为 ${range.earliest} 至 ${range.latest}；在补齐完整出生日期前，不输出确定的最低缴费年限或资格结论。`,
      confidence: "low",
    });
  }
  setDeep(ctx, "calc.caveats", caveats);
}

function addPolicyBoundaryWarnings(
  ctx: any,
  asOfDate: string,
  selection: ReturnType<typeof selectPolicyPacksForUser>,
  policyDataAsOf: string,
): void {
  const warnings = Array.isArray(ctx.calc?.warnings) ? ctx.calc.warnings : [];
  const addWarning = (warning_id: string, text: string) => {
    if (!warnings.some((item: any) => item?.warning_id === warning_id)) {
      warnings.push({ warning_id, text });
    }
  };

  const fallbackDomains = Object.values(selection.domains).filter(
    (route) => route.scope === "province" && route.city,
  );
  if (fallbackDomains.length > 0) {
    addWarning(
      "W-PROVINCE-ONLY",
      `以下事项尚未启用已审核地市参数包：${fallbackDomains.map((route) => `${domainLabel(route.domain)}（${route.city}市）`).join("、")}。这些事项仅按辽宁省级通用规则提示，不计算地市金额或办理口径。`,
    );
  }

  const locations = asRecord(ctx.user?.locations);
  if (
    !locations.medical_insured_city ||
    !locations.medical_benefit_city ||
    !locations.unemployment_benefit_city
  ) {
    addWarning(
      "W-LOCATION-ROLES-INCOMPLETE",
      "当前参保地、医保待遇地、失业待遇领取地和户籍地可能不同；字段未补齐前不能用同一个城市替代，也不能输出地市级资格或金额。",
    );
  }

  if (asOfDate > policyDataAsOf) {
    addWarning(
      "W-ANNUAL-DATA-REVIEW",
      `精确年度数值仅核验至 ${policyDataAsOf}；${asOfDate.slice(0, 4)} 年测算不会沿用已到期的历史缴费基数或档次，应等待当年度官方参数复核。`,
    );
  }

  addWarning(
    "W-JOB-SUBSIDY-NOT-CALCULATED",
    "就业困难人员灵活就业社保补贴的省级方向为不超过实际缴费2/3、一般最长36个月；因地市、身份及实际缴费额尚未完整建模，本结果不计算补贴金额。",
  );

  setDeep(ctx, "calc.warnings", warnings);
}

function minDate(values: string[]): string {
  if (values.length === 0) throw new Error("Policy metadata date is missing");
  return [...values].sort()[0];
}

function domainLabel(domain: "pension" | "medical" | "unemployment") {
  return domain === "pension" ? "养老" : domain === "medical" ? "医保" : "失业";
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Execute a single rule in-memory against a given context.
 * Used by the test runner for single-rule tests.
 */
export function executeSingleRuleInMemory(
  rule: RuleDefinition,
  ctx: any,
): { ctx: any; trace: TraceEntry[] } {
  return executeRule(rule, ctx);
}

/**
 * Flatten DB param rows into a flat params map.
 * Scalar params: params[param_id] = value
 * Table/timeline params: params[param_id] = rows
 * Array params: params[param_id] = value (already an array)
 */
function flattenParams(dbParams: any[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const p of dbParams) {
    const paramId = p.paramId;
    const type = p.type;

    if (type === "table" || type === "timeline") {
      // Table/timeline params store rows in the rows column
      result[paramId] = p.rows ?? [];
    } else {
      // Scalar params (number, boolean, string, array) store in value
      result[paramId] = p.value;
    }
  }

  return result;
}

/**
 * Auto-compute user.subsidy.months_to_legal_retire after R-120.
 * R-530 depends on this field; it is derived from the standard legal retirement date.
 */
function autoComputeMonthsToRetire(ctx: any, asOfDate: string): void {
  const retireDate = getDeep(ctx, "calc.retirement.legal_retire_date");
  const existing = getDeep(ctx, "user.subsidy.months_to_legal_retire");

  if (retireDate && (existing === null || existing === undefined)) {
    const fromParts = asOfDate.split("-");
    const toParts = String(retireDate).split("-");

    if (fromParts.length >= 2 && toParts.length >= 2) {
      const fromYear = parseInt(fromParts[0], 10);
      const fromMonth = parseInt(fromParts[1], 10);
      const toYear = parseInt(toParts[0], 10);
      const toMonth = parseInt(toParts[1], 10);

      const months = (toYear - fromYear) * 12 + (toMonth - fromMonth);
      setDeep(ctx, "user.subsidy.months_to_legal_retire", months);
    }
  }
}
