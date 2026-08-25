import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { params } from "@/lib/db/schema";

export type ParamRecord = typeof params.$inferSelect;

export async function resolveParamRecord(paramKey: string): Promise<ParamRecord | null> {
  const numericId = Number(paramKey);

  if (Number.isInteger(numericId) && numericId > 0) {
    const rows = await db
      .select()
      .from(params)
      .where(eq(params.id, numericId))
      .limit(1);
    return rows[0] ?? null;
  }

  const rows = await db
    .select()
    .from(params)
    .where(eq(params.paramId, paramKey))
    .orderBy(desc(params.version))
    .limit(1);

  return rows[0] ?? null;
}

export function validateParamRecord(record: ParamRecord) {
  const isTable = record.type === "table" || record.type === "timeline";
  const checks = [
    {
      name: "schema",
      passed: Boolean(record.paramId && record.type && record.policyPackId),
      detail: "检查 param_id/type/policy_pack_id",
    },
    {
      name: "value",
      passed: isTable ? Array.isArray(record.rows) : record.value !== null,
      detail:
        isTable ? "table/timeline 需要 rows" : "标量或数组参数需要 value",
    },
    {
      name: "effective_period",
      passed: Boolean(
        record.effectiveFrom &&
          (!record.effectiveTo || record.effectiveTo >= record.effectiveFrom),
      ),
      detail: "必须填写 effective_from，effective_to 如填写不得早于生效日",
    },
    {
      name: "source",
      passed: Boolean(record.source?.trim()),
      detail: "生产参数必须保留官方来源链接或文号",
    },
    {
      name: "applicability",
      passed: record.applicableProvince === "辽宁省",
      detail: "必须明确适用省份；地市参数还应填写 applicable_city",
    },
    {
      name: "review",
      passed: Boolean(
        record.reviewedAt &&
          record.reviewStatus === "approved" &&
          ["high", "medium"].includes(record.confidence ?? ""),
      ),
      detail: "必须记录审核日期、approved 状态和可接受置信度",
    },
  ];

  return {
    valid: checks.every((check) => check.passed),
    checks,
    results: {
      param_id: record.paramId,
      type: record.type,
    },
  };
}
