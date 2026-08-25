import type { LiaoningCity } from "@/lib/regions/liaoning";

// 用户画像领域类型。可选项常量同时供运行时校验使用，避免枚举值漂移。

export const USER_GENDERS = ["male", "female"] as const;
export type UserGender = (typeof USER_GENDERS)[number];

export const FEMALE_RETIRE_TYPES = [
  "worker50",
  "cadre55",
  "unknown",
] as const;
export type FemaleRetireType = (typeof FEMALE_RETIRE_TYPES)[number];

export const RETIREMENT_EXCEPTION_TYPES = [
  "none",
  "special_work",
  "disability",
  "other",
  "unknown",
] as const;
export type RetirementExceptionType =
  (typeof RETIREMENT_EXCEPTION_TYPES)[number];

export const MEDICAL_INSURANCE_TYPES = [
  "employee",
  "resident",
  "unknown",
] as const;
export type MedicalInsuranceType = (typeof MEDICAL_INSURANCE_TYPES)[number];

export const DEEMED_CONTRIBUTION_STATUSES = [
  "none",
  "included",
  "unverified",
] as const;
export type DeemedContributionStatus =
  (typeof DEEMED_CONTRIBUTION_STATUSES)[number];

export const RETIRE_PREFERENCES = [
  "earliest",
  "standard",
  "latest",
] as const;
export type RetirePreference = (typeof RETIRE_PREFERENCES)[number];

export const EMPLOYMENT_STATUSES = [
  "employed",
  "unemployed",
  "flexible",
  "retired",
  "unknown",
] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export const USER_OBJECTIVES = [
  "min_cost",
  "max_pension",
  "keep_medical",
  "balanced",
] as const;
export type UserObjective = (typeof USER_OBJECTIVES)[number] | null;

export interface UserProfileBasic {
  birth_year_text?: string | null;
  birth_year?: number | null;
  birth_month?: number | null;
  birth_day?: number | null;
  /** 由出生年月日标准化得到，不接受模型或接口直接指定。 */
  birth_date?: string | null;
  gender?: UserGender | null;
  /** 仅女性使用；男性不填写，由规则引擎自动进入男性退休分支。 */
  female_retire_type?: FemaleRetireType | null;
  /** 用户明确提到的特殊工种、病残等情形；未提及特殊退休时应省略。 */
  retirement_exception_type?: RetirementExceptionType | null;
  /** 兼容旧会话的辽宁参保统筹地区；写入时统一为不带“市”的标准名称。 */
  target_city?: LiaoningCity | null;
  retire_preference?: RetirePreference | null;
  /** 用户拟选择的退休时间；仅用于弹性退休最低缴费年限初算，最终以审批为准。 */
  planned_retire_date?: string | null;
}

export interface UserProfileSocial {
  pension_contrib_months?: number | null;
  medical_contrib_months?: number | null;
  unemployment_insurance_years?: number | null;
  /** 养老累计月数是否已妥善计入待认定的视同缴费年限。 */
  deemed_contribution_status?: DeemedContributionStatus | null;
  base_lower_amount_per_month?: number | null;
  min_wage_amount_per_month?: number | null;
  paid_months_in_year?: number[] | null;
}

export interface UserProfileStatus {
  employment_status?: EmploymentStatus | null;
  on_unemployment_benefit?: boolean | null;
  unemployment_benefit_months_used?: number | null;
  unemployment_benefit_months_remaining?: number | null;
}

export interface UserProfileSubsidy {
  has_employment_difficulty_cert?: boolean | null;
  /** 由法定退休日期和测算日期计算，不接受模型或接口直接指定。 */
  months_to_legal_retire?: number | null;
}

export interface UserProfileMI {
  insurance_type?: MedicalInsuranceType | null;
  /** 待遇享受地职工医保实际缴费月数。 */
  benefit_city_actual_contrib_months?: number | null;
  /** medical_contrib_months 是否已包含经确认的医保视同缴费年限。 */
  deemed_contribution_included?: boolean | null;
  prev_end_date?: string | null;
  enroll_date?: string | null;
}

export interface UserProfileLocations {
  /** 养老保险当前参保地。 */
  pension_insured_city?: LiaoningCity | null;
  /** 医疗保险当前参保地。 */
  medical_insured_city?: LiaoningCity | null;
  /** 退休后拟享受职工医保待遇的统筹地区。 */
  medical_benefit_city?: LiaoningCity | null;
  /** 失业保险金待遇领取地。 */
  unemployment_benefit_city?: LiaoningCity | null;
  /** 户籍地；不得替代参保地或待遇地。 */
  household_city?: LiaoningCity | null;
}

export interface UserProfile {
  basic?: UserProfileBasic;
  social?: UserProfileSocial;
  status?: UserProfileStatus;
  subsidy?: UserProfileSubsidy;
  mi?: UserProfileMI;
  locations?: UserProfileLocations;
  objective?: UserObjective;
}
