import { normalizeLiaoningCity, type LiaoningCity } from "@/lib/regions/liaoning";

export interface ImportValidationIssue {
  row: number;
  field: string;
  message: string;
}

export interface ApprovedLiaoningImportRow {
  province: "辽宁省";
  city: LiaoningCity;
  review_status: "approved";
}

const FORBIDDEN_PRODUCTION_MARKERS = [
  "上海",
  "随申办",
  "SHANGHAI",
  "P-SH-",
  "T-SH-",
  "RS-SHANGHAI",
];

/** 后台生产导入只接受已审核的辽宁地市数据，整批校验失败则一条也不写入。 */
export function validateApprovedLiaoningImportRows(
  rows: Record<string, unknown>[],
): { normalized: Array<Record<string, unknown> & ApprovedLiaoningImportRow>; issues: ImportValidationIssue[] } {
  const normalized: Array<Record<string, unknown> & ApprovedLiaoningImportRow> = [];
  const issues: ImportValidationIssue[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // Excel 第一行通常是表头
    const region = asRecord(row.region);
    const provinceRaw = String(row.province ?? region.province ?? "").trim();
    const cityRaw = String(row.city ?? region.city ?? "").trim();
    const reviewStatus = String(row.review_status ?? row.reviewStatus ?? "")
      .trim()
      .toLowerCase();
    const city = normalizeLiaoningCity(cityRaw);

    if (provinceRaw !== "辽宁" && provinceRaw !== "辽宁省") {
      issues.push({ row: rowNumber, field: "province", message: "省份必须明确为辽宁省" });
    }
    if (!city) {
      issues.push({ row: rowNumber, field: "city", message: "城市必须是辽宁省14个地级市之一" });
    }
    if (reviewStatus !== "approved") {
      issues.push({ row: rowNumber, field: "review_status", message: "仅允许导入审核状态为 approved 的数据" });
    }

    const serialized = JSON.stringify(row);
    const marker = FORBIDDEN_PRODUCTION_MARKERS.find((item) =>
      serialized.toUpperCase().includes(item.toUpperCase()),
    );
    if (marker) {
      issues.push({
        row: rowNumber,
        field: "content",
        message: `检测到非辽宁生产内容标识：${marker}`,
      });
    }

    if (
      (provinceRaw === "辽宁" || provinceRaw === "辽宁省") &&
      city &&
      reviewStatus === "approved" &&
      !marker
    ) {
      normalized.push({
        ...row,
        province: "辽宁省",
        city,
        review_status: "approved",
      });
    }
  });

  return { normalized, issues };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}
