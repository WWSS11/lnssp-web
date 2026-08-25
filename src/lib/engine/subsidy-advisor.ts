import { getDeep } from "./actions";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SubsidyRecommendation {
  subsidy_name: string;
  eligible: boolean | null;
  prerequisites: string[];
  timing: string;
  /** 金额只允许表示人民币，不得用来承载期限等其他量纲。 */
  estimated_amount: number | null;
  estimated_duration_months?: number | null;
  amount_note?: string;
  action_steps: string[];
}

// ─── Main Entry ──────────────────────────────────────────────────────────────

/**
 * Scan calc.subsidy.* and calc.unemployment.* fields to produce
 * a list of all subsidies the user may be eligible for,
 * with prerequisites, timing, and action steps.
 */
export function adviseSubsidies(
  calc: Record<string, unknown>,
  _user: Record<string, unknown>,
): SubsidyRecommendation[] {
  void _user;
  const recommendations: SubsidyRecommendation[] = [];

  // 只展示当前辽宁生产规则集真正核算过的项目。就业困难人员社保补贴和
  // 地方岗位补贴存在地市差异，未启用相应城市规则前不得靠文案层补造。
  const olderUi = checkOlderUIPensionFund(calc);
  if (olderUi) recommendations.push(olderUi);

  const unemployment = checkUnemploymentBenefit(calc);
  if (unemployment) recommendations.push(unemployment);

  return recommendations;
}

// ─── Individual Subsidy Checks ───────────────────────────────────────────────

function checkOlderUIPensionFund(
  calc: Record<string, unknown>,
): SubsidyRecommendation | null {
  const eligible = getDeep(calc, "subsidy.older_ui_pension_fund_eligible") as
    | boolean
    | null
    | undefined;

  if (eligible !== true) return null;

  const prerequisites: string[] = [
    "领取失业金期间",
    "距法定退休年龄不足1年",
    "以个人身份参加辽宁省企业职工基本养老保险并实际缴费",
    "基金仅承担按当地灵活就业人员最低缴费标准计算的部分，超出部分由本人承担",
  ];

  const actionSteps = [
    "先按规定以个人身份缴纳企业职工基本养老保险费",
    "在达到法定退休年龄或出现规定停发情形后，向失业保险经办机构提出申请",
    "准备本人身份证件、社会保障卡及经办机构要求的个人缴费凭证等材料",
    "由经办机构核定后，将基金承担费用一次性发放至本人社会保障卡银行账户",
  ];

  return {
    subsidy_name: "大龄领取失业保险金人员养老保险费支持",
    // 当前规则只识别到政策时间窗口，尚未核验个人参保、实际缴费和材料，
    // 因此不能向用户展示为无条件“可申请”。
    eligible: null,
    prerequisites,
    timing: "距离法定退休年龄不足1年期间实际缴费，达到办理时点后申请核定",
    estimated_amount: null,
    amount_note: "仅补助按当地灵活就业人员最低缴费标准计算的部分；须先缴后补，以经办核定为准",
    action_steps: actionSteps,
  };
}

function checkUnemploymentBenefit(
  calc: Record<string, unknown>,
): SubsidyRecommendation | null {
  const durationMonths = getDeep(calc, "unemployment.duration_months") as
    | number
    | null
    | undefined;
  if (durationMonths == null) return null;
  const preliminarilyEligible = getDeep(calc, "unemployment.eligible") as
    | boolean
    | null
    | undefined;

  const prerequisites: string[] = [
    "非因本人意愿中断就业（非主动辞职）",
    "失业保险缴费满1年",
    "已办理失业登记并有求职要求",
  ];

  const actionSteps = [
    "先确认是否属于非因本人意愿中断就业，并完成失业登记",
    "通过待遇领取地人社部门公布的线上渠道或经办窗口申请",
    "由经办机构结合缴费记录、已领取月数和停发情形核定实际期限",
  ];

  return {
    subsidy_name: "失业保险金领取期限初步核算",
    eligible:
      durationMonths <= 0 || preliminarilyEligible === false ? false : null,
    prerequisites,
    timing: "完成失业登记后尽快按待遇领取地经办要求申请",
    estimated_amount: null,
    estimated_duration_months: durationMonths,
    amount_note: "领取标准需结合待遇领取地最低工资标准及个人条件另行核定",
    action_steps: actionSteps,
  };
}
