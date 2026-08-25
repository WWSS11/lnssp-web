import { z } from "zod";
import {
  EMPLOYMENT_STATUSES,
  DEEMED_CONTRIBUTION_STATUSES,
  FEMALE_RETIRE_TYPES,
  MEDICAL_INSURANCE_TYPES,
  RETIREMENT_EXCEPTION_TYPES,
  RETIRE_PREFERENCES,
  USER_GENDERS,
  USER_OBJECTIVES,
} from "@/types/user-profile";
import { normalizeLiaoningCity } from "@/lib/regions/liaoning";

// 与 AI tools.ts 使用相同边界；API 层额外接受 null，以兼容未填写的画像字段。
const nullableOptional = <T extends z.ZodType>(schema: T) =>
  schema.nullable().optional();

const birthYearSchema = z.number().int().min(1940).max(2010);
const birthMonthSchema = z.number().int().min(1).max(12);
const birthDaySchema = z.number().int().min(1).max(31);
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
const contribMonthsSchema = z.number().int().min(0).max(600);
const unemploymentYearsSchema = z.number().min(0).max(50);
const policyAmountSchema = z.number().positive().max(1_000_000);
const benefitMonthsSchema = z.number().int().min(0).max(600);
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD")
  .refine(isValidIsoDate, "日期不是有效的公历日期");

const BasicSchema = z
  .object({
    birth_year_text: nullableOptional(z.string().trim().max(20)),
    birth_year: nullableOptional(birthYearSchema),
    birth_month: nullableOptional(birthMonthSchema),
    birth_day: nullableOptional(birthDaySchema),
    gender: nullableOptional(z.enum(USER_GENDERS)),
    female_retire_type: nullableOptional(z.enum(FEMALE_RETIRE_TYPES)),
    retirement_exception_type: nullableOptional(
      z.enum(RETIREMENT_EXCEPTION_TYPES),
    ),
    target_city: nullableOptional(targetCitySchema),
    retire_preference: nullableOptional(z.enum(RETIRE_PREFERENCES)),
    planned_retire_date: nullableOptional(isoDateSchema),
  })
  .superRefine((basic, ctx) => {
    const parts = [basic.birth_year, basic.birth_month, basic.birth_day];
    const hasAnyPart = parts.some((value) => value != null);
    const hasAllParts = parts.every((value) => value != null);

    if (hasAnyPart && hasAllParts && !isValidDateParts(
      basic.birth_year!,
      basic.birth_month!,
      basic.birth_day!,
    )) {
      ctx.addIssue({
        code: "custom",
        path: ["birth_day"],
        message: "出生日期不是有效的公历日期",
      });
    }
  })
  .transform((basic) => {
    if (basic.gender === "male") {
      const normalized = { ...basic };
      delete normalized.female_retire_type;
      return normalized;
    }
    return basic;
  });

const SocialSchema = z.object({
  pension_contrib_months: nullableOptional(contribMonthsSchema),
  medical_contrib_months: nullableOptional(contribMonthsSchema),
  unemployment_insurance_years: nullableOptional(unemploymentYearsSchema),
  deemed_contribution_status: nullableOptional(
    z.enum(DEEMED_CONTRIBUTION_STATUSES),
  ),
  base_lower_amount_per_month: nullableOptional(policyAmountSchema),
  min_wage_amount_per_month: nullableOptional(policyAmountSchema),
  paid_months_in_year: nullableOptional(
    z
      .array(z.number().int().min(1).max(12))
      .max(12)
      .transform((months) => [...new Set(months)].sort((a, b) => a - b)),
  ),
});

const StatusSchema = z.object({
  employment_status: nullableOptional(z.enum(EMPLOYMENT_STATUSES)),
  on_unemployment_benefit: nullableOptional(z.boolean()),
  unemployment_benefit_months_used: nullableOptional(benefitMonthsSchema),
  unemployment_benefit_months_remaining:
    nullableOptional(benefitMonthsSchema),
});

const SubsidySchema = z.object({
  has_employment_difficulty_cert: nullableOptional(z.boolean()),
});

const MiSchema = z.object({
  insurance_type: nullableOptional(z.enum(MEDICAL_INSURANCE_TYPES)),
  benefit_city_actual_contrib_months: nullableOptional(contribMonthsSchema),
  deemed_contribution_included: nullableOptional(z.boolean()),
  prev_end_date: nullableOptional(isoDateSchema),
  enroll_date: nullableOptional(isoDateSchema),
});

const LocationsSchema = z.object({
  pension_insured_city: nullableOptional(targetCitySchema),
  medical_insured_city: nullableOptional(targetCitySchema),
  medical_benefit_city: nullableOptional(targetCitySchema),
  unemployment_benefit_city: nullableOptional(targetCitySchema),
  household_city: nullableOptional(targetCitySchema),
});

export const UserProfileSchema = z.object({
  basic: BasicSchema.optional(),
  social: SocialSchema.optional(),
  status: StatusSchema.optional(),
  subsidy: SubsidySchema.optional(),
  mi: MiSchema.optional(),
  locations: LocationsSchema.optional(),
  objective: nullableOptional(z.enum(USER_OBJECTIVES)),
});

const identifierSchema = z.string().trim().min(1).max(100);

export const PlanComputeRequestSchema = z.object({
  user: UserProfileSchema,
  as_of_date: isoDateSchema.optional(),
  rule_set_id: identifierSchema.optional(),
  policy_pack_id: identifierSchema.optional(),
});

/** 公开接口固定使用服务端当天与默认辽宁链路，不接受客户端选择政策版本。 */
export const PublicPlanComputeRequestSchema = z
  .object({ user: UserProfileSchema })
  .strict();

export type UserProfileInput = z.infer<typeof UserProfileSchema>;
export type PlanComputeRequestInput = z.infer<typeof PlanComputeRequestSchema>;

function isValidIsoDate(value: string): boolean {
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 2100) return false;

  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  return isValidIsoDate(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  );
}
