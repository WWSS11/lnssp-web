const PARAM_EDITABLE_FIELDS = [
  "value", "unit", "effectiveFrom", "effectiveTo", "source", "keyFields",
  "valueFields", "rows", "note", "applicableProvince", "applicableCity",
  "insuranceType", "availability", "reviewedAt", "reviewStatus", "confidence",
] as const;

const RULE_EDITABLE_FIELDS = [
  "name", "module", "dslVersion", "priority", "effectiveFrom", "effectiveTo",
  "supersedes", "inputs", "parameterRefs", "decisionTable", "outputs",
  "examples", "evidence", "notes",
] as const;

export function pickParamDraftFields(body: unknown, creating = false) {
  return pickFields(body, [
    ...(creating ? (["policyPackId", "paramId", "type"] as const) : []),
    ...PARAM_EDITABLE_FIELDS,
  ]);
}

export function pickRuleDraftFields(body: unknown, creating = false) {
  return pickFields(body, [
    ...(creating ? (["ruleId"] as const) : []),
    ...RULE_EDITABLE_FIELDS,
  ]);
}

function pickFields(body: unknown, fields: readonly string[]) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const source = body as Record<string, unknown>;
  return Object.fromEntries(
    fields
      .filter((field) => Object.prototype.hasOwnProperty.call(source, field))
      .map((field) => [field, source[field]]),
  );
}
