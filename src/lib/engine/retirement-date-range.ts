export interface RetirementDateRange {
  earliest: string;
  latest: string;
  precision: "incomplete_birth_date";
}

interface BasicBirthInput {
  birth_year?: unknown;
  birth_month?: unknown;
  birth_day?: unknown;
  gender?: unknown;
  female_retire_type?: unknown;
}

/**
 * 缺少出生月/日时枚举该出生年份内所有可能日期，给出保守退休日期区间。
 * 这只用于提示，不得反向生成最低缴费年限或资格结论。
 */
export function estimateRetirementDateRange(
  basic: BasicBirthInput | null | undefined,
): RetirementDateRange | null {
  const birthYear = Number(basic?.birth_year);
  const gender = basic?.gender;
  const femaleType = basic?.female_retire_type;

  if (!Number.isInteger(birthYear) || (gender !== "male" && gender !== "female")) {
    return null;
  }
  if (
    gender === "female" &&
    femaleType !== "worker50" &&
    femaleType !== "cadre55"
  ) {
    return null;
  }

  const suppliedMonth = toIntegerOrNull(basic?.birth_month);
  const suppliedDay = toIntegerOrNull(basic?.birth_day);
  if (suppliedMonth != null && suppliedDay != null) return null;

  const months = suppliedMonth == null
    ? Array.from({ length: 12 }, (_, index) => index + 1)
    : [suppliedMonth];
  const retirementDates: string[] = [];

  for (const month of months) {
    const lastDay = new Date(Date.UTC(birthYear, month, 0)).getUTCDate();
    const days = suppliedDay == null
      ? Array.from({ length: lastDay }, (_, index) => index + 1)
      : suppliedDay <= lastDay
        ? [suppliedDay]
        : [];

    for (const day of days) {
      const age = computeDelayedRetirementAge(
        birthYear,
        month,
        gender,
        gender === "male" ? "na" : String(femaleType),
      );
      retirementDates.push(
        addYearsMonths(birthYear, month, day, age.years, age.months),
      );
    }
  }

  retirementDates.sort();
  if (retirementDates.length === 0) return null;
  return {
    earliest: retirementDates[0],
    latest: retirementDates[retirementDates.length - 1],
    precision: "incomplete_birth_date",
  };
}

function computeDelayedRetirementAge(
  birthYear: number,
  birthMonth: number,
  gender: "male" | "female",
  femaleType: string,
): { years: number; months: number } {
  let originalAge: number;
  let targetAge: number;
  let startYear: number;
  let monthsPerDelay: number;

  if (gender === "male") {
    originalAge = 60;
    targetAge = 63;
    startYear = 1965;
    monthsPerDelay = 4;
  } else if (femaleType === "cadre55") {
    originalAge = 55;
    targetAge = 58;
    startYear = 1970;
    monthsPerDelay = 4;
  } else {
    originalAge = 50;
    targetAge = 55;
    startYear = 1975;
    monthsPerDelay = 2;
  }

  const birthIndex = (birthYear - startYear) * 12 + birthMonth - 1;
  const maxDelayMonths = (targetAge - originalAge) * 12;
  const delayMonths = birthIndex < 0
    ? 0
    : Math.min(maxDelayMonths, Math.max(0, Math.ceil((birthIndex + 1) / monthsPerDelay)));
  const totalMonths = originalAge * 12 + delayMonths;
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12 };
}

function addYearsMonths(
  year: number,
  month: number,
  day: number,
  years: number,
  months: number,
): string {
  const monthIndex = month - 1 + months;
  const targetYear = year + years + Math.floor(monthIndex / 12);
  const targetMonth = (monthIndex % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function toIntegerOrNull(value: unknown): number | null {
  return Number.isInteger(value) ? Number(value) : null;
}
