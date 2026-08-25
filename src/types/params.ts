// Param types matching ssp_policy_params.schema.json

export interface PolicyPack {
  policy_pack_id: string;
  description?: string;
  as_of: string;
  policy_data_as_of: string;
  last_reviewed_at: string;
  review_due_at?: string;
  applicable_province: "辽宁省";
  applicable_city?: string | null;
  scope: "province" | "city";
  review_status: "pending" | "approved" | "rejected";
  confidence: "high" | "medium" | "low";
  params: ScalarParam[];
  tables: TableParam[];
}

export interface ScalarParam {
  param_id: string;
  type: "number" | "boolean" | "string" | "array";
  value: ParamValue;
  unit?: string;
  effective_from?: string;
  source?: string;
  effective_to?: string | null;
  availability?: "current" | "historical_only";
  reviewed_at?: string;
  confidence?: "high" | "medium" | "low";
}

export interface TableParam {
  param_id: string;
  type: "table" | "timeline";
  effective_from?: string;
  key_fields: string[];
  value_fields: string[];
  rows: TableRow[];
  note?: string;
  source?: string;
  effective_to?: string | null;
  availability?: "current" | "historical_only";
  reviewed_at?: string;
  confidence?: "high" | "medium" | "low";
}

export type TableRow = Record<string, string | number | boolean | null>;

export type ParamValue = string | number | boolean | number[] | string[] | null;

export interface TimelineParam {
  param_id: string;
  type: "timeline";
  effective_from?: string;
  key_fields: string[];
  value_fields: string[];
  rows: TimelineRow[];
  note?: string;
  source?: string;
}

export interface TimelineRow {
  [key: string]: string | number | boolean | null | undefined;
}
